# Bug: Per-session Usage tab shows account-wide totals (every project on disk)

**Severity:** P0 — wrong data, highly visible, violates Architecture Invariant #9 ("Data integrity")
**Filed:** 2026-05-16
**Reporter symptom:** "I opened the Usage tab on a session whose cost is around $2.5k and it says `Total cost: $48,827.93`. It even lists `kimi-k2.5` which I've never used in this project."

## Symptom

The Usage tab in the bottom panel of any session view renders a per-model
table whose total cost matches the sum of **every JSONL file under
`~/.claude/projects/`** — including unrelated repos and non-Anthropic models
(e.g. `kimi-k2.5` from another project run through a different client).

| Layer            | Value                              | Belongs to           |
|------------------|------------------------------------|----------------------|
| URL              | `/session/<repo>/<sessionId>`      | one specific session |
| TopBar cost      | `$2,499.xx`                        | this session         |
| Usage tab footer | `Total cost: $48,827.93`           | every session on disk|
| Usage tab rows   | `claude-sonnet-4-6`, `kimi-k2.5`…  | every project        |

Three different surfaces, one source of stale state — the Usage tab is
account-scoped while everything else is session-scoped.

## Empirical evidence

Raw HTTP responses with two different sessions on the same machine:

```
$ curl -s http://localhost:8787/api/usage/breakdown | jq '.breakdown.totalCost'
48827.93

$ curl -s http://localhost:8787/api/sessions/<sessId>/context-usage | jq '.usage'
null   # cold session — SDK getContextUsage() unavailable

$ curl -s "http://localhost:8787/api/usage/breakdown?sessionId=<sessId>" | jq '.breakdown.totalCost'
2499.07
```

The breakdown endpoint already had everything it needed to scope per
session — it just wasn't reading the query param.

## Root cause

Two cooperating bugs, server-side and client-side:

### Server — `server/src/http/routes/discovery-routes.ts:128`

```ts
router.get("/usage/breakdown", (_req, res) => {   // ← _req: query ignored
  const sessions = discoverSessions();             // ALL sessions, globally
  const breakdown = aggregatePerModelUsage(sessions);
  res.json({ breakdown });
});
```

The handler parameter is named `_req`, signaling the request object is
intentionally discarded. There is no filtering — every JSONL file on
disk is aggregated together. Anyone calling this endpoint gets a global
sum regardless of context.

### Client — `dashboard/src/components/bottom-panel/UsageTab.tsx:108`

```ts
const res = await fetch("/api/usage/breakdown");   // ← no params, ever
```

The fallback branch (`FallbackBreakdown`) is reached whenever
`/api/sessions/:sessionId/context-usage` returns `usage: null` — which
covers **every cold / historical session** (the SDK
`query.getContextUsage()` only works for live, active sessions). For
all those sessions, the user sees an account-wide aggregate they have
no reason to expect.

The component knows the `sessionId` from props, but never threaded it
down to `FallbackBreakdown`.

## Why it stayed hidden

- For users with a single small project on disk, account-wide ≈
  session-scoped, so the numbers looked plausible.
- The live SDK branch (`LiveBreakdown`) is correctly scoped — only
  cold/historical sessions trigger the fallback. Active users editing
  their current session never noticed.
- The fallback path was added for "historical sessions" semantically,
  but with no parameter, "historical" silently meant "everything ever."

## Fix

### Server — accept optional `?sessionId=`

```diff
-router.get("/usage/breakdown", (_req, res) => {
-  try {
-    const sessions = discoverSessions();
+router.get("/usage/breakdown", (req, res) => {
+  try {
+    const sessionId =
+      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
+    let sessions = discoverSessions();
+    if (sessionId) {
+      sessions = sessions.filter((s) => s.id === sessionId);
+    }
     const breakdown = aggregatePerModelUsage(sessions);
     res.json({ breakdown });
   } catch (err) { … }
 });
```

When `sessionId` is absent, behavior is unchanged (back-compat for any
account-level dashboard view). When present, only the matching session
flows into `aggregatePerModelUsage`. A non-matching id passes an empty
array — explicit, no silent leak to "all sessions."

### Client — thread `sessionId` through to the fetch URL

```diff
- return <FallbackBreakdown />;
+ return <FallbackBreakdown sessionId={sessionId} />;
…
-function FallbackBreakdown(): JSX.Element {
+interface FallbackBreakdownProps { sessionId?: string }
+function FallbackBreakdown({ sessionId }: FallbackBreakdownProps = {}): JSX.Element {
   …
-  const res = await fetch("/api/usage/breakdown");
+  const url = sessionId
+    ? `/api/usage/breakdown?sessionId=${encodeURIComponent(sessionId)}`
+    : "/api/usage/breakdown";
+  const res = await fetch(url);
   …
-  }, []);
+  }, [sessionId]);
```

`encodeURIComponent` defends against any sessionId shape (UUID is
already URL-safe, but the encoder is the contract). The effect
dependency on `sessionId` re-fetches if the user navigates between
sessions without unmounting the tab.

## Regression tests

### Server — `server/src/http/routes-discovery.test.ts`

Three new specs under `GET /usage/breakdown > ?sessionId scoping (regression)`:

1. **without sessionId, aggregates across ALL sessions (back-compat)** —
   asserts the aggregator receives both mocked sessions, proving the
   global aggregate path still works.
2. **with sessionId, aggregates ONLY the matching session** — passes
   `?sessionId=sess-A` against `[sess-A, sess-B]` and asserts the
   aggregator received only `sess-A`.
3. **with sessionId that matches nothing, passes empty list (no leak)** —
   `?sessionId=none` must NOT silently fall back to "all sessions."

### Client — `dashboard/src/components/bottom-panel/UsageTab.test.tsx`

One new spec under `UsageTab — live mode`:

- **includes ?sessionId on the fallback /api/usage/breakdown fetch** —
  renders `<UsageTab sessionId="cold-sess-123" />`, mocks
  `context-usage` to return `{usage: null}` (forcing fallback), then
  inspects every fetched URL. Asserts the breakdown URL is exactly
  `/api/usage/breakdown?sessionId=cold-sess-123` — not the bare path
  the bug shipped with.

### Both-directions verification

| State                              | Server tests | Dashboard test |
|------------------------------------|--------------|----------------|
| Master (no fix)                    | 2 of 3 fail  | 1 fails        |
| Branch (fix applied)               | All pass     | Passes         |

The back-compat server test passes on master too — by design — because
omitting `?sessionId` must preserve the legacy global aggregate. The
two new scoping specs fail on master and pass with the fix.

## Files modified

- `server/src/http/routes/discovery-routes.ts` — handler accepts optional `?sessionId`
- `dashboard/src/components/bottom-panel/UsageTab.tsx` — `FallbackBreakdown` accepts and forwards `sessionId`
- `server/src/http/routes-discovery.test.ts` — 3 new regression specs
- `dashboard/src/components/bottom-panel/UsageTab.test.tsx` — 1 new regression spec
- `docs/bugs/usage-tab-fallback-account-wide.md` — this document

## Related

- Architecture Invariant #9 (CLAUDE.md): "Numbers must be correct. Token
  counts, costs, status must match JSONL source. Wrong data is worse
  than no data." The Usage tab claimed $48k for a $2.5k session — a
  direct violation.
- The route still exposes the legacy account-wide aggregate when called
  without params. If no consumer needs it, a follow-up could require
  `sessionId`. For now back-compat is preserved.
