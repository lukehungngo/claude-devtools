# Bug: Session swap sometimes renders previous session's data

**Severity:** P0 — wrong data on every panel, intermittent, user-visible
**Filed:** 2026-05-16
**Reported version:** v0.3.12 (also affects all prior versions back to the introduction of `useSessionMetrics`)
**Reporter symptom:** "I click a session on the sidebar, sometimes I fail to load the data of the selected session, it keeps the data of previous selected session."

## Symptom

After clicking a session row in the sidebar:

- URL bar updates correctly to `/session/<slug>/<newSessionId>`
- Sidebar highlight moves to the new row
- **But every panel (TopBar, TurnHistory, ConversationView, BottomPanel tabs) continues to render the previous session's data**

Intermittent. Reproduces reliably when clicking quickly between sessions where the first click's `/api/sessions/...` response has already arrived (in-memory) before the second click fires.

Empirical visual confirmation:

| Layer | Value | Belongs to |
|---|---|---|
| URL | `/session/claude-devtools/45403533-...` | session C |
| Sidebar highlight | `45403533` row highlighted | session C |
| TopBar | branch `feature/collector`, COST $25.21, 9 AGENTS, IN 8K / OUT 108K | session B |
| TurnHistory | T1–T10, "checkout to master first…", "save to docs", "/model" | session B |
| ConversationView | "Status per commit" table — collector migration plan | session B |
| BottomPanel Agent Graph | 3 agents (Main + 2 Explore subagents), 7m 7s | session B |

Three different surfaces, one source of stale state.

## Root cause (verified empirically, not hypothesis)

`dashboard/src/hooks/useSessionData.ts:44-49`

```ts
.then((data) => {
  setMetrics(data.metrics || null);
  setEvents(data.events || []);
  setSubagentMeta(data.subagentMeta || {});
  setLoading(false);
})
.catch((err) => {
  if (err instanceof DOMException && err.name === "AbortError") return;
  …
});
```

The second `.then` writes the response into React state **unconditionally** — it never checks whether the fetch was meant to be cancelled. The `.catch` correctly handles `AbortError`, but the `.then` has no equivalent guard.

The `AbortController` from React's effect cleanup correctly aborts the underlying fetch — **only while the body is still being streamed**. If the response was already fully received and `r.json()` already resolved when the user clicks another session, the `.then` chain is already settled. Calling `controller.abort()` at that point is a no-op. The `.then` runs anyway, overwrites the new session's freshly-set state with the previous session's data, and React renders the stale session.

### Verified evidence — live browser repro

Setup: temporary instrumentation in `useSessionData.ts` logging every fetch lifecycle event into `window.__CDT_DBG_FETCH__`, plus an artificial 4 s delay after `r.json()` resolves for the targeted session (simulates a slow disk read on a large JSONL, or a response that was already fully buffered before the user clicked away).

Sequence: programmatically click session B (slow armed) at t = 0, click session C 1500 ms later.

```
t=    0 ms   cleanup-abort  bbbfedfe      (the prior session)
t=    1 ms   fetch-start    f413de33      (B clicked — slow .then armed)
t= 1490 ms   cleanup-abort  f413de33      (C clicked 1.5 s later)
t= 1490 ms   fetch-start    45403533      (C's fetch starts)
t= 1677 ms   then-runs      45403533  aborted=false  events=290    ✓ C's data set correctly
t= 4281 ms   then-runs      f413de33  aborted=true   events=3019   ✗ stale B writes OVER C
```

At t=4281 ms the framework correctly reports `controller.signal.aborted === true`, but the `.then` ignores this and proceeds to call `setMetrics`/`setEvents`/`setSubagentMeta` with B's data. C's state is silently overwritten.

Visual confirmation matches the table at the top of this doc.

## Why it's intermittent ("sometimes")

The race requires three conditions to coincide:

1. The current session's `/api/sessions/...` response is fully received and `r.json()` has resolved.
2. The user clicks another session before the second `.then` callback completes.
3. The new session's fetch completes *first*, so its `.then` runs and writes correct data, then the stale `.then` overwrites it.

On localhost with small sessions this rarely fires — the response and the JSON parse both finish in <50 ms, much faster than a human click cadence. With:

- a large JSONL (40 K events, multi-MB response), or
- a slower disk / busy server, or
- React microtask delays under load,

the window between "response in pipe" and "`.then` finishes" widens to hundreds of milliseconds, well within human double-click range. That's the "sometimes" the user reports.

## Scope

Searched the codebase — `useSessionMetrics` is the **only** fetch hook with this pattern. `PromptInput.tsx` uses `AbortController` for prompt submissions but the lifecycle is different (single submission, not a key-driven re-fetch).

## Fix

One line — add an `aborted` guard at the top of the success `.then`:

```diff
       .then((data) => {
+        if (controller.signal.aborted) return;
         setMetrics(data.metrics || null);
         setEvents(data.events || []);
         setSubagentMeta(data.subagentMeta || {});
         setLoading(false);
       })
```

This matches React's idiomatic pattern documented at <https://react.dev/learn/synchronizing-with-effects#fetching-data> (the "ignore" boolean closure is functionally equivalent; here `controller.signal.aborted` is the AbortController-native version).

Belt-and-suspenders alternative: closure-capture `sessionKey` at the top of the effect and compare against `prevSessionKeyRef.current` inside the `.then`. This would also guard against future refactors that drop the AbortController. The signal check is the smaller, more targeted fix and is sufficient.

## Regression test (proposed)

A vitest in `dashboard/src/hooks/useSessionData.test.ts` that:

1. Renders the hook with `(hashA, idA)`.
2. Mocks `fetch` so that the first call returns a Promise that resolves after 100 ms with `dataA`.
3. Re-renders the hook with `(hashA, idB)` immediately. Mocks `fetch` so the second call resolves in <10 ms with `dataB`.
4. Waits 200 ms.
5. Asserts the hook's exposed `metrics === dataB.metrics` (not `dataA.metrics`).

Without the fix this test fails because `dataA`'s stale `.then` overwrites `dataB`. With the fix it passes because the aborted check short-circuits the stale write.

## Related

- React docs on fetch race conditions in effects: <https://react.dev/learn/synchronizing-with-effects#fetching-data>
- Architecture invariant #1 (CLAUDE.md): "Numbers must be correct. Wrong data is worse than no data." This bug silently shows wrong data on every panel — a direct violation.
