# TASK-R3E-NEW-9 — SDKPermissionDeniedMessage distinct UI

## Summary

Render auto-denied tool calls (classifier / rule / mode / asyncAgent) distinctly
from user-interactive denials. Previously the SDK's
`SDKPermissionDeniedMessage` (sdk.d.ts:3244-3268) was silently dropped at the
SSE layer; this task forwards it through to a red-bordered `AutoDenialBlock`
that lives inline in the conversation, mirroring the StaticCompactMarker
pattern from FU-4.

Two surfaces covered:

- **Live SSE** — `useStreamingState.permissionDenials` collects records
  arriving over SSE (dedupe by `tool_use_id`, first-wins).
- **Replayed JSONL** — a new `extractPermissionDenials(events, turns)` walker
  (analogous to `extractCompactMarkers`) produces per-turn markers that
  `ConversationView` injects between turns as `AutoDenialBlock` rows.

## Files Modified

Server:
- `server/src/http/sse-event-handler.ts` — new `SSEPermissionDeniedEvent`
  interface (added to the `SSEEvent` union) + append-only branch in
  `mapSdkMessageToSSEEvents` for `type: "system" / subtype: "permission_denied"`.
- `server/src/http/sse-event-handler.test.ts` — +2 tests (full fields + minimal
  shape).

Dashboard:
- `dashboard/src/lib/streaming-types.ts` — new `PermissionDeniedRecord` type;
  `StreamingState.permissionDenials: PermissionDeniedRecord[]`;
  `createInitialStreamingState()` seeds an empty array.
- `dashboard/src/hooks/useStreamingState.ts` — new `permission_denied` case in
  the SSE reducer (dedupe by `tool_use_id`, first-wins).
- `dashboard/src/hooks/useStreamingState.test.ts` — +2 tests (append + dedupe).
- `dashboard/src/lib/permissionDenials.ts` (NEW) — `extractPermissionDenials`
  walker for replayed sessions; mirrors `lib/compactEvents.ts`.
- `dashboard/src/components/conversation/AutoDenialBlock.tsx` (NEW) — small
  red-bordered row with ShieldX icon, badge per `decision_reason_type`, and the
  rejection message returned to the model.
- `dashboard/src/components/conversation/AutoDenialBlock.test.tsx` (NEW) — +8
  tests covering all 5 badge color mappings, message rendering, agent_id /
  decision_reason omission, and data-testid stability.
- `dashboard/src/components/conversation/ConversationView.tsx` — append-only:
  wired `extractPermissionDenials` + `permissionDenialsByTurn` map, plumbed
  through `VirtualizedTurnList` and `TurnRow` (both virtualised + fallback
  paths), and updated the `MemoTurnRow` equality predicate to include the new
  array. No deletions; no behavioural change to existing render paths.
- `dashboard/src/components/conversation/ConversationView.test.tsx` — +2 tests
  (renders inline when permission_denied event present; renders nothing when
  absent).

Wave 2 non-overlap: `dashboard/src/components/bottom-panel/HooksTab.tsx` and
`TasksTab.tsx` untouched (verified `git diff --stat`).

## Color / Badge Mapping (5 chosen)

| `decision_reason_type` | Badge CSS variable     |
|-----------------------|------------------------|
| `classifier`          | `var(--cat-cyan)`      |
| `rule`                | `var(--cat-amber)`     |
| `mode`                | `var(--cat-purple)`    |
| `asyncAgent`          | `var(--cat-orange)`    |
| (unknown / undefined) | `var(--err)` — red     |

Border + icon use `var(--err)` regardless — the block itself signals "denied";
the badge color discriminates by source.

## Test Count Delta

- Server: +2 tests (44 → 46 in `sse-event-handler.test.ts`).
- Dashboard hook: +2 tests (`useStreamingState.test.ts` 22 → 24).
- Dashboard new component: +8 tests (`AutoDenialBlock.test.tsx`).
- Dashboard view: +2 tests (`ConversationView.test.tsx` 23 → 25).

Total: **+14 tests**.

## Verification

```
server: 46 passed
dashboard (hooks + conversation): 457 passed
npx tsc -p server --noEmit: clean
npx tsc -p dashboard --noEmit: clean
eslint (new + modified files): 0 errors, 0 new warnings (9 pre-existing
warnings in ConversationView.tsx unchanged)
```

## Worktree / Branch

`worktree-agent-af907a54655664e59` — based on `master @ phase-r3e-wave1`.

## Follow-ups / Concerns

- The `SystemEvent` shared type still only declares `subtype: string` — the
  permission_denied fields (`tool_name`, `tool_use_id`, etc.) are widened
  locally inside `permissionDenials.ts` exactly the way `compactEvents.ts`
  widens `compactMetadata`. Promoting these to a shared discriminated SystemEvent
  union is a separate cleanup not in scope.
- HooksTab "Source" column augmentation suggested by the spec (adding
  "Permission" as a third source) is intentionally out of scope per the
  Wave 2 non-overlap constraint — that file belongs to NEW-8.
