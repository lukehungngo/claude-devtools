# Bug: Inline TaskGrid (and Tasks tab) show cumulative state, not per-turn delta

**Severity:** P2 — misleading data, every turn looks like it created every task
**Filed:** 2026-05-16
**Reported version:** v0.3.12
**Reporter symptom:** Latest TurnCard shows `+61 tasks (click to expand)` listing T-001 through T-061 — but the turn only created 1-2 of those.

## Symptom

The inline TaskGrid in `TurnCard` (rendered for any turn with task tool calls) shows the **cumulative** task list at the end of that turn — not the tasks that were Created or Updated *in* that turn. Result: every TurnCard's TaskGrid grows over the session, and the latest TurnCard lists every task ever created.

The bottom-panel Tasks tab (scoped to the latest turn by default after Bug C) has the same shape — it inherits the cumulative snapshot at turn N, which at the latest turn is identical to whole-session cumulative state.

## Empirical evidence

Live session `23ba0306-...`:

```
Inline TaskGrid for current turn:
  Total rows: 61
  First row: T-001 "P0-1: Widen stop_reason enum"          (created many turns ago)
  Last row:  T-061 "Investigate: is inline TaskGrid..."    (created this turn)
```

User expectation: the TaskGrid for a turn should show ONLY tasks Created or Updated in that turn.

## Root cause

`dashboard/src/lib/sessionTasks.ts:101-121` — `deriveTasksByTurn(events, turns)` stores the **cumulative** task list at the end of each turn:

```ts
if (turnHadTaskTools && tasks.length > 0) {
  result.set(turn.turnNumber, [...tasks]); // cumulative snapshot
}
```

Both consumers (`ConversationView.tsx:592-595` for the inline grid, `BottomPanel.tsx:136-145` for the Tasks tab) pull from this map and display the cumulative slice — but the UI is per-turn, so users read the cumulative snapshot as "tasks for this turn".

## Fix

Add a new helper `deriveTasksTouchedInTurn(events, turns)` that, for each turn, stores only the subset of cumulative state corresponding to tasks Created or Updated in that turn. Rewire both consumers to use the new helper. Keep `deriveTasksByTurn` and `getTasksAtTurn` exported for backward-compatibility.

`dashboard/src/lib/sessionTasks.ts` — append:

```ts
export function deriveTasksTouchedInTurn(
  events: readonly SessionEvent[],
  turns: readonly TurnSnapshot[],
): Map<number, SessionTask[]> { ... }
```

Semantics:
- **TaskCreate** always marks the new task as touched.
- **TaskUpdate** with a valid `taskId` always marks the targeted task as touched; the POST-update status is what surfaces (so an Update(done) in turn N surfaces with `status=done`).
- **TaskUpdate** against an unknown `taskId` is a no-op (does not mark the turn as touched).
- **TaskList** is a read-only no-op — never marks a turn as touched.
- **Same-turn Create+Update** collapses to one entry with the final status (both ops touch the same id; the filter selects each touched id once).
- **Turns with no TaskCreate/TaskUpdate** are absent from the returned map — callers can rely on `.get(turn) === undefined` to skip rendering.

`dashboard/src/components/conversation/ConversationView.tsx:592-595` — swap import + call:

```diff
- import { deriveTasksByTurn } from "../../lib/sessionTasks";
+ import { deriveTasksTouchedInTurn } from "../../lib/sessionTasks";
  ...
  const tasksByTurn = useMemo(
-   () => deriveTasksByTurn(events, turns),
+   () => deriveTasksTouchedInTurn(events, turns),
    [events, turns],
  );
```

`dashboard/src/components/bottom-panel/BottomPanel.tsx` — swap import, swap helper, and change the consumer from `getTasksAtTurn(closest-prior)` to a direct `.get(N) ?? []` lookup. Under delta semantics, "scoped to T<N>" means "what T<N> did", not "the cumulative state at T<N>":

```diff
  const sessionTasks = useMemo(
    () =>
      effectiveScopeTurn !== undefined
-       ? getTasksAtTurn(tasksByTurn, effectiveScopeTurn)
+       ? (tasksByTurn.get(effectiveScopeTurn) ?? [])
        : deriveSessionTasks(events),
    [tasksByTurn, effectiveScopeTurn, events],
  );
```

`dashboard/src/components/bottom-panel/TasksTab.tsx` — update header label so users understand they're seeing a delta:

```diff
- {completedCount}/{tasks.length} completed
+ {completedCount}/{tasks.length} completed in this turn
```

## Edge case handling

- **TaskList alone does NOT mark a turn as touched.** A turn whose only task tool is `TaskList` (read-only inspection) renders no TaskGrid inline and no rows in the Tasks tab.
- **Same-turn Create+Update collapses into one entry.** If turn N creates task X and immediately updates it to `done`, X appears once in N's delta with `status=done` — not twice and not as a separate "create" + "update" pair.
- **Viewing a turn with no task tools shows "Scoped to T<N>" with empty tasks.** This is deliberate. The bottom-panel scope label still renders so the user knows what they're looking at, and the empty body is a true statement: "T<N> did not Create or Update any tasks". Prior cumulative behavior (showing the closest-prior snapshot) would have been misleading — the user would see tasks the *previous* turn created and read them as belonging to the current turn.
- **Unknown TaskUpdate.taskId is a no-op.** If a TaskUpdate references a taskId that doesn't exist in the cumulative state (e.g. wrong id, deleted, sidechain), it neither modifies the cumulative state nor marks the turn as touched.

## Regression test

`dashboard/src/lib/sessionTasks.test.ts` — new `describe("deriveTasksTouchedInTurn (Bug D — per-turn DELTA)")` block. Fixture spans 5 turns:
- T1 TaskCreate "a" → expect `result.get(1)` = [a:pending]
- T2 TaskCreate "b" → expect `result.get(2)` = [b:pending] (NOT [a, b])
- T3 TaskUpdate(taskId=1, completed) → expect `result.get(3)` = [a:done]
- T4 no tool uses → expect `result.get(4)` = undefined
- T5 TaskList only → expect `result.get(5)` = undefined

Plus two focused tests:
- Same-turn Create+Update collapses to one entry with final status.
- TaskUpdate against unknown taskId does not mark the turn as touched.

**Both-directions verification:** Stashing `sessionTasks.ts` and running the new tests confirms all 3 fail with `deriveTasksTouchedInTurn is not a function` on master; restoring and re-running confirms all 13 tests in the file pass.

## Consumer-test fallout (intentional)

Two pre-existing tests pinned the cumulative semantics and were updated to match delta semantics — not "fixed" in the sense of patching around the new behavior, but rewritten because their assertions no longer described the desired UI:

1. `dashboard/src/components/conversation/ConversationView.test.tsx` — `accumulates tasks across multiple TaskCreate events` was renamed to `shows per-turn DELTA — latest turn lists only tasks it Created (Bug D)`. Fixture is unchanged; expected count for the latest turn dropped from 3 (cumulative) to 2 (delta of T3 alone), and an additional assertion confirms T1 still renders its own 1-task delta.
2. `dashboard/src/components/bottom-panel/BottomPanel.test.tsx` — `auto-scopes Tasks to the latest turn when viewingTurnNumber is undefined` updated: fixture's T3 has no task tools, so delta is empty. The "Scoped to T3" label still renders (correct), but the tasks list is now empty ("No tasks") instead of the cumulative 2-row snapshot from T2.

## Related

- `docs/bugs/tasks-not-scoped-to-turn.md` — Phase 1, scoping mechanism.
- `docs/bugs/tasks-tab-not-auto-scoped-to-active-turn.md` — Phase 2 (Bug C), auto-scope to latest turn.
- This doc (Bug D) — Phase 3: change the *semantics* of "scope" from cumulative-at-turn to delta-per-turn.
