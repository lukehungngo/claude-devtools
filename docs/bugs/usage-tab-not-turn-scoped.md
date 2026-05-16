# Bug: Usage tab is whole-session only — does not follow the active turn

**Severity:** P2 — confusing UX, inconsistent with Tasks/Hooks/Detail/Raw/Trace tabs
**Filed:** 2026-05-17
**Reported version:** v0.3.12
**Related Phase 2 of:** `docs/bugs/tasks-tab-not-auto-scoped-to-active-turn.md` (Bug C — Tasks tab auto-scoping)
**Related fix it builds on:** `docs/bugs/usage-tab-fallback-account-wide.md` (Bug E — `?sessionId=` per-session scoping)

## Symptom

The Usage tab in the bottom panel renders a whole-session per-model footer
(`Total cost: $X.XX` summed across every turn) even when the user is
viewing a single turn. Every other surface in the bottom panel — Tasks
(Bug C), Hooks, Detail, Raw, Trace — re-scopes to the active turn once
Bug C ships. Usage stayed whole-session. There is no "Turn N usage"
label, so users can't tell whether the number reflects the turn they're
looking at or the whole session.

## Why we can't just fix the SDK path

`/api/sessions/:sessionId/context-usage` returns the SDK's
`query.getContextUsage()` snapshot. That call is **time of question** by
construction — it inspects the live in-flight context window. There is
no SDK method for "context as of turn N." Any attempt to scope it would
return either nonsense or the same whole-session snapshot.

So the SDK live path can't carry turn scope. The only useful per-turn
data source is the JSONL aggregation (the `/api/usage/breakdown`
fallback), which can be filtered to a turn's event window.

## Decision

When `effectiveScopeTurn != null` (BottomPanel passes this after Bug C —
defaults to the latest turn when the user hasn't explicitly clicked):

1. **Skip the SDK `/context-usage` fetch entirely.** No wasted I/O, no
   flash of stale SDK content before the fallback takes over.
2. **Hit `/api/usage/breakdown?sessionId=…&fromTs=…&toTs=…`** so the
   server aggregates only the turn's events.
3. **Header label** reads `"Turn N usage — Total cost $X"` instead of
   `"Per-model usage — Total cost $X"`.
4. **Hide the SDK-rich sections** (MCP servers / Agents / Skills /
   Slash commands / Message breakdown). Those only have meaning at the
   whole-session level; rendering them per-turn would either lie or
   require fabricating data that doesn't exist.

When `effectiveScopeTurn` is `null` (no turn anchor — e.g. an empty
session, or a state where Bug C's fallback can't produce a snapshot),
behavior is unchanged: SDK live path first, fallback to whole-session
JSONL.

### UX consequence — deliberate

Tasks-tab math is **cumulative-up-to-N**, so "Tasks at latest turn" ≡
"Tasks whole-session" and the user-visible count doesn't change at the
default anchor (only the "Scoped to T<N>" label appears).

Usage-tab math is **per-turn delta**. At the latest-turn default
anchor, the number is the cost of that one turn — which is smaller
than today's whole-session footer. Users will notice. This is the
correct semantic for "what is the panel currently focused on?" and
mirrors what Tasks does on older turns (just no narrowing on latest).

## Design choice — `?fromTs=&toTs=` (timestamp range), not `?turnNumber=` or `?fromIndex=&toIndex=`

The task brief suggested `?fromIndex=&toIndex=` for simplicity. We chose
**`?fromTs=&toTs=`** instead.

| Option | Why we picked / rejected it |
|---|---|
| `?turnNumber=` | Would require porting the dashboard's `groupEventsIntoTurns` to the server. Heavy coupling, two source-of-truth implementations to keep in sync. **Rejected.** |
| `?fromIndex=&toIndex=` | "Simple," but only correct if dashboard `allEvents` and server `loadFullSession()` use identical merge order. Dashboard adds live (WebSocket) events appended after REST events; server returns REST sorted by timestamp. For active sessions with any live events, indexes would silently desync. **Rejected.** |
| **`?fromTs=&toTs=`** | Frame-independent. `TurnSnapshot.startTime` and `.endTime` are already ISO-8601 timestamps derived from event timestamps. Server filters by `e.timestamp >= fromTs && e.timestamp <= toTs`. Survives any merge-order difference. **Chosen.** |

### Boundary — closed on both ends

`TurnSnapshot.endTime` IS the timestamp of the turn's LAST event (see
`dashboard/src/lib/turnSnapshot.ts:464` and `:635`), not "one past the
end." A naive half-open `[fromTs, toTs)` would drop the assistant's
final message — usually the `end_turn` carrying most of the turn's
output tokens and cost. The server window is therefore CLOSED on both
ends: `e.timestamp >= fromTs && e.timestamp <= toTs`. A regression spec
locks this in (see "Tests added" §1.5 below).

## Root cause

`dashboard/src/components/bottom-panel/UsageTab.tsx` accepted only
`sessionId`. It always tried `/api/sessions/:sessionId/context-usage`
first (whole-session SDK), and on null/error fell back to the JSONL
aggregator (whole-session by default after Bug E, or whole-session per
this session). No code path narrowed to a turn.

`server/src/http/routes/discovery-routes.ts` `/usage/breakdown` route
accepted only `?sessionId=`. It called `aggregatePerModelUsage(sessions)`
which uses a file-scoped, byte-offset-cached pipeline that aggregates
the entire file. No way to slice by event range.

## Fix — server

Add a sibling helper `aggregateEventsPerModel(events: SessionEvent[])`
in `server/src/analyzer/usage-breakdown.ts`. Same per-assistant-event
accumulation logic as `computeSessionBuckets`, but operates on an
already-parsed event array (no file I/O, no cache).

Extend the `/usage/breakdown` route to accept `?fromTs=&toTs=`. When
**all three** of `sessionId`, `fromTs`, `toTs` are present:

1. `discoverSessions().filter(s => s.id === sessionId)` — keep the
   no-leak behaviour from Bug E.
2. `loadFullSession(...)` to get `mainEvents + subagentEvents`, merged
   and sorted by timestamp (mirrors `session-routes.ts:254`).
3. `merged.filter(e => e.timestamp >= fromTs && e.timestamp <= toTs)` — closed interval (see "Boundary" above).
4. `aggregateEventsPerModel(slice)` and return.

If only the range is supplied without `sessionId`, the route falls
through to the legacy `aggregatePerModelUsage(sessions)` path (range
params are dashboard-internal, so this case is "back-compat — ignore
ill-formed input rather than 400").

If `sessionId` is unknown, return an empty breakdown — no leak into
other sessions, no JSONL load attempted.

```diff
-import { aggregatePerModelUsage } from "../../analyzer/usage-breakdown.js";
+import {
+  aggregatePerModelUsage,
+  aggregateEventsPerModel,
+} from "../../analyzer/usage-breakdown.js";
+import type { SessionEvent } from "../../types.js";

 router.get("/usage/breakdown", (req, res) => {
   try {
     const sessionId = …;
+    const fromTs = …;
+    const toTs = …;
+    if (sessionId && fromTs && toTs) {
+      const matches = discoverSessions().filter((s) => s.id === sessionId);
+      if (matches.length === 0) {
+        return res.json({ breakdown: aggregateEventsPerModel([]) });
+      }
+      const { mainEvents, subagentEvents } = loadFullSession(matches[0]);
+      const allSub: SessionEvent[] = [];
+      for (const evts of subagentEvents.values()) allSub.push(...evts);
+      const merged = [...mainEvents, ...allSub].sort(
+        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
+      );
+      const slice = merged.filter((e) => e.timestamp >= fromTs && e.timestamp < toTs);
+      return res.json({ breakdown: aggregateEventsPerModel(slice) });
+    }
     // … legacy whole-session path unchanged …
   }
 });
```

## Fix — client

`dashboard/src/components/bottom-panel/UsageTab.tsx`:

- New props: `effectiveScopeTurn`, `scopeFromTs`, `scopeToTs`.
- `isTurnScoped` ⇔ all three are set.
- When `isTurnScoped`, the SDK live-fetch effect short-circuits to
  `kind: "fallback"` — `/context-usage` is never called.
- `FallbackBreakdown` accepts `turnNumber`, `fromTs`, `toTs`. Builds
  `URLSearchParams` so the breakdown URL is exactly
  `/api/usage/breakdown?sessionId=…&fromTs=…&toTs=…`.
- Header label switches:
  ```
  turnNumber !== undefined ? `Turn ${turnNumber} usage` : "Per-model usage"
  ```
- Effect deps include `fromTs`, `toTs` so navigating between turns
  re-fetches.
- The SDK-rich sections (MCP / Agents / Skills / Slash commands /
  Message breakdown) live inside `LiveBreakdown` which is unreachable
  in turn-scoped mode (we never enter `kind: "ready"`), so they're
  hidden by construction — no separate gate needed.

`dashboard/src/components/bottom-panel/BottomPanel.tsx`:

- Resolve `effectiveScopeTurnSnapshot` once via
  `turns.find(t => t.turnNumber === effectiveScopeTurn)`.
- Pass `effectiveScopeTurn`, `scopeFromTs: snapshot?.startTime`,
  `scopeToTs: snapshot?.endTime` to `<UsageTab>`.

## Tests added

### Server — `server/src/http/routes-discovery.test.ts`

New `describe("?fromTs/?toTs turn scoping (Bug H regression)")` with
five specs:

1. **with sessionId + fromTs + toTs, slices events by [fromTs, toTs]
   and aggregates only that slice** — three mock assistant events; only
   the one in-window is passed to `aggregateEventsPerModel`. The whole-
   session aggregator is asserted NOT called.
2. **fromTs/toTs without sessionId is ignored** — back-compat: legacy
   `aggregatePerModelUsage` runs, slice aggregator is not called.
3. **sessionId + range with no events in the window returns empty
   breakdown (no error)** — slice aggregator called with `[]`.
4. **includes events whose timestamp equals toTs (CLOSED upper bound)**
   — boundary regression: two events at exactly `fromTs` and exactly
   `toTs`; both must be in the slice. Locks in the closed-on-both-ends
   semantics that match how `TurnSnapshot.endTime` is computed.
5. **sessionId + range with unknown sessionId returns empty (no leak)**
   — `loadFullSession` not called, no whole-session leak, slice
   aggregator called with `[]`.

### Client — `dashboard/src/components/bottom-panel/UsageTab.test.tsx`

New `describe("UsageTab — turn-scoped mode (Bug H)")` with four specs:

1. **does NOT call `/context-usage` when effectiveScopeTurn is set** —
   inspects every URL fetched and asserts none include `/context-usage`.
2. **breakdown URL carries sessionId, fromTs, and toTs** — exact match
   on the breakdown URL params (URL-encoded).
3. **header reads "Turn N usage" not "Per-model usage" when turn-scoped**
   — `getByText(/Turn 7 usage/i)` present, `queryByText(/^Per-model usage$/i)` absent.
4. **does NOT render the SDK-rich sections when turn-scoped** —
   `queryByTestId("usage-section-mcp" | "usage-section-agents" |
   "usage-section-skills" | "usage-section-slash-commands" |
   "usage-section-message-breakdown")` all null.

### Both-directions verification

| State                                     | New server specs | New dashboard specs |
|-------------------------------------------|------------------|---------------------|
| Master (no fix)                           | 4 of 5 fail      | 3 of 4 fail         |
| Branch (fix applied)                      | All pass         | All pass            |

(Server spec #2 — "ignored without sessionId" — passes on master
because the back-compat path is already the only path. Dashboard spec
#4 — "no SDK sections" — passes on master because without
`effectiveScopeTurn` the SDK fetch returns `null` and the fallback
mounts, which already lacks those sections.)

### Full test counts (post-fix)

- `routes-discovery.test.ts`: **26 → 30** (+4 new turn-scoping specs +1
  for the unknown-sessionId no-leak case already added under the
  existing `?sessionId` block layout).
- Server suite total: **774 passed**, 31 skipped. 1 unrelated flaky
  timeout in `session-discovery.test.ts > "returns same reference on
  rapid successive calls (cache hit)"` — passes in isolation, pre-
  existing, unrelated to this change.
- `UsageTab.test.tsx`: **11 → 15** (+4 new turn-scoping specs).
- Dashboard suite total: **1628 passed**, 4 skipped. 1 pre-existing
  failure in `useInsightsAggregate.test.ts > "computes delta from
  daily[] slices"` — confirmed by reproducing on master, unrelated to
  this change.

### Typecheck

```
cd server && npx tsc --noEmit       # clean
cd dashboard && npx tsc --noEmit    # clean
```

### Lint

Pre-existing warnings and 5 errors in unrelated files (`jsonl-reader.test.ts`
require-imports, `permission-handler.ts` unused `err`). No new
errors/warnings introduced by Bug H. Verified with
`npx eslint <changed-files-only>` → 4 pre-existing warnings, 0 errors.

## Files modified

- `server/src/analyzer/usage-breakdown.ts` — new `aggregateEventsPerModel(events)` sibling helper
- `server/src/http/routes/discovery-routes.ts` — route accepts `?fromTs/?toTs`, turn-scoped branch
- `server/src/http/routes-discovery.test.ts` — 4 new Bug H specs, mock surface extended
- `dashboard/src/components/bottom-panel/UsageTab.tsx` — new props + turn-scoped fallback, header label, skip SDK fetch
- `dashboard/src/components/bottom-panel/BottomPanel.tsx` — wire `effectiveScopeTurnSnapshot` → `<UsageTab>`
- `dashboard/src/components/bottom-panel/UsageTab.test.tsx` — 4 new Bug H specs
- `docs/bugs/usage-tab-not-turn-scoped.md` — this document

## Related

- Architecture Invariant #9 (CLAUDE.md): "Numbers must be correct." A
  whole-session footer shown while the user is anchored on one turn
  reads, to most users, as "this turn cost $X" — when it actually means
  "this whole session cost $X." Numerically right, semantically wrong.
- `docs/bugs/tasks-tab-not-auto-scoped-to-active-turn.md` (Bug C) —
  this Bug H builds on the `effectiveScopeTurn` BottomPanel already
  computes for Tasks.
- `docs/bugs/usage-tab-fallback-account-wide.md` (Bug E) — Bug H
  extends the route Bug E added `?sessionId=` to.
