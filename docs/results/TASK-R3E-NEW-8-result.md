# TASK-R3E-NEW-8 — Live hook progress in HooksTab via SDK hook lifecycle messages

Worktree: `.claude/worktrees/agent-a3825c23f77a0919c`
Branch:   `worktree-agent-a3825c23f77a0919c`

## Summary

Surfaces in-flight hooks in HooksTab with a spinner + live elapsed-time counter.
Previously only completed `hook_success` / `hook_cancelled` JSONL attachments
rendered, so hooks were invisible until they finished. NEW-8 adds an SDK→SSE→
reducer→component path for `SDKHookStartedMessage`, `SDKHookProgressMessage`,
and `SDKHookResponseMessage` (`sdk.d.ts:3080-3116`).

## SDK fields used (verified against sdk.d.ts)

| SDK message | Fields surfaced through SSE |
|-------------|----------------------------|
| `SDKHookStartedMessage`  | `hook_id`, `hook_name`, `hook_event` |
| `SDKHookProgressMessage` | `hook_id`, `hook_name`, `hook_event`, `output?`, `stdout?`, `stderr?` |
| `SDKHookResponseMessage` | `hook_id`, `hook_name`, `hook_event`, `outcome`, `exit_code?`, `output?`, `stdout?`, `stderr?` |

All field names are snake_case — verbatim from the SDK. Notable callouts:

- `tool_use_id` is **not** present on `SDKHookStartedMessage` (the task spec
  field list was illustrative). It belongs to a sibling `hook_invoked` shape
  upstream of these three lifecycle messages.
- `success: boolean` does not exist on the SDK response. Forwarded `outcome:
  'success' | 'error' | 'cancelled'` instead — strictly more information.
- `durationMs` is computed dashboard-side (`Date.now() - startedAt`) at
  `hook_response` time because the SDK does not carry it on these messages.

## Load-bearing deviation from the task wording

Task said "APPEND new branches" for the SSE handler. Stub branches with the
wrong (camelCase) field names already existed from P0-5. Appending duplicate
`subtype === "hook_started"` cases would have double-fired every event, and
the old shape was wrong per the SDK. I **edited** the existing branches to
match the SDK contract and updated the three stub tests. Architecture invariant
#6 (SDK ground truth) outranks the prose instruction. The stub had no live
consumer; NEW-8 is the first consumer and pins the contract.

## Files modified

Server:
- `server/src/http/sse-event-handler.ts` — corrected SSE event types &
  mapper branches to SDK snake_case fields; added `output` / `stdout` /
  `stderr` / `outcome` / `exit_code` carry-through.
- `server/src/http/sse-event-handler.test.ts` — replaced 3 stub-shape tests
  with 5 SDK-shape tests (started, progress, response, outcome default,
  outcome preservation).

Dashboard:
- `dashboard/src/lib/streaming-types.ts` — new `LiveHookState` type; added
  `liveHooks: Map<string, LiveHookState>` to `StreamingState`; initialised in
  `createInitialStreamingState()`.
- `dashboard/src/hooks/useStreamingState.ts` — three new reducer cases
  (`hook_started`, `hook_progress`, `hook_response`) plus a narrow helper for
  the `outcome` union.
- `dashboard/src/hooks/useStreamingState.test.ts` — added 4 tests covering
  the lifecycle transitions and the defensive ignore-unknown-id path.
- `dashboard/src/components/bottom-panel/HooksTab.tsx` — added `liveHooks?`
  prop, `useVisibleLiveHooks` (1-second tick + 3 s drop window), and a
  `LiveHookRow` that renders the spinner + elapsed counter.
- `dashboard/src/components/bottom-panel/HooksTab.test.tsx` — added 3 tests
  (spinner present for in-flight, elapsed counter ticks each second,
  completed row drops after the hold window).
- `dashboard/src/contexts/LayoutContext.ts` — added `liveHooks` / `setLiveHooks`.
- `dashboard/src/routes/AppLayout.tsx` — owns the `liveHooks` state, forwards
  it into `<BottomPanel liveHooks={liveHooks} />`.
- `dashboard/src/components/bottom-panel/BottomPanel.tsx` — accepts
  `liveHooks?` and forwards into `<HooksTab>`.
- `dashboard/src/components/conversation/ConversationView.tsx` — bridges
  `streamingState.liveHooks` into `LayoutContext.setLiveHooks` (mirrors the
  existing B2-WIRE OTel bridge).
- Test-mock updates (4 files): `LayoutContext.test.ts`,
  `__tests__/group5-wiring.test.tsx`,
  `components/conversation/ContextWarningBanner.test.tsx`,
  `components/bottom-panel/UsageTab.test.tsx` — added
  `liveHooks: null, setLiveHooks: () => {}` to each context-value mock.

## Test count delta

| File | Before | After | Δ |
|------|--------|-------|---|
| `server/src/http/sse-event-handler.test.ts` | 44 | 46 | +2 (removed 3 stub-shape, added 5 SDK-shape) |
| `dashboard/src/hooks/useStreamingState.test.ts` | 22 | 26 | +4 |
| `dashboard/src/components/bottom-panel/HooksTab.test.tsx` | 19 | 22 | +3 |

Net: **+9 tests added across the three target files**.

Full suites still green:
- Server: 732 passed | 31 skipped (763 total)
- Dashboard: 1551 passed | 4 skipped (1555 total)

## Verification

```
npx tsc -p server --noEmit            # clean
npx tsc -p dashboard --noEmit         # clean
pnpm -C server vitest run src/http/sse-event-handler.test.ts        # 46 passed
pnpm -C dashboard vitest run \
  src/hooks/useStreamingState.test.ts \
  src/components/bottom-panel/HooksTab.test.tsx                     # 48 passed
```

Lint: only one pre-existing error in HooksTab (`prefer-const` on line 351 —
also present on master at line 198 before any of my edits). No new
warnings/errors from this change.

## Follow-ups / concerns

- The `prefer-const` lint error on `let total = rows.length` predates NEW-8.
  Fixable in a one-liner, but out of scope here.
- HooksTab now has two `<tbody>` blocks; the existing summary stats (`stats`
  memo) intentionally count only JSONL-source rows so per-second tick
  re-renders don't churn the totals. If the design wants `liveHooks` to count
  toward "N hooks", lift the counting into `stats` and gate on `completed`.
- AppLayout owns `liveHooks` state. When the active session changes,
  ConversationView's bridge effect will push the new session's map; the old
  one is replaced via reference equality. No explicit reset needed.
- **Pre-existing concern (not specific to NEW-8):** `streamingActions.reset()`
  is never called from `ConversationView`, so `streamingState.liveHooks`
  (alongside `responseText`, `compactResult`, etc.) survives a session
  switch until the hook is remounted. Same risk applies to the existing
  fields; recommend a separate fix that wires `reset()` to a `sessionId`-
  change effect.
- **Flicker window is narrowed, not eliminated.** The 3 s `LIVE_HOOK_DROP_MS`
  buffer hides the typical case (JSONL `hook_success` lands within 3 s of
  `hook_response`). Two edge cases remain:
  1. JSONL arrives <3 s after `hook_response` → live row + JSONL row both
     render briefly (visual duplicate, not a gap).
  2. JSONL arrives >3 s after `hook_response` → live row drops, brief gap,
     then JSONL renders (actual flicker).
  Spec acceptance criterion accepts the buffer approach; a stricter fix
  would key-deduplicate by `hook_id` across live + JSONL sources.
- HooksTab's `LiveHookRow` puts the elapsed-seconds counter in the "Tool use"
  column because SDK lifecycle messages carry no `tool_use_id`. Consider
  moving it into the "ms" column on a future design pass.

## CRITICAL non-overlap note (Wave 2 NEW-7 / NEW-9)

This worktree only touched the listed files. The SSE handler edits append at
the **end** of the existing `mapSdkMessageToSSEEvents` switch (the three hook
cases stay in their original position next to other `system` subtypes), and
the new SSE event interfaces are inserted in-place where the old stubs lived
to keep the `SSEEvent` union ordering identical to master — both NEW-7 and
NEW-9 can append their own branches without conflict.
