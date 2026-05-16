# Bug: bottom-panel Tasks tab is not scoped to the active turn

> **Status:** Phase 1 (explicit-scope-on-click) implemented. Phase 2 (auto-scope-to-active-turn by default) tracked in [tasks-tab-not-auto-scoped-to-active-turn.md](./tasks-tab-not-auto-scoped-to-active-turn.md) — supersedes the "Fix sketch" section below.

## Symptom

Viewing **turn T59**, the bottom panel scope pill reads **"Scoped to T59"**, but the **Tasks** tab still shows the global cumulative task list (T-001..T-017, "0/17 completed") — including tasks that were created and last updated in turns long before T59.

Other bottom tabs (Tool Call, Cost, Agent Graph) honor the turn scope; Tasks ignores it.

Screenshot: 2026-05-16 14:43, session with main + 5 subagents, viewing T59.

## Why this is a bug

- Inconsistency: the same scope pill applies to siblings but not to Tasks → confusing UX.
- Data integrity: at T59 the "correct" task state is the state the TodoWrite list was in **as of T59**, not the final cumulative state.
- Subagent contamination compounds it: cumulative state mixes main-agent and subagent TodoWrite calls (see `docs/bugs/...` — separate sidechain gap I flagged earlier).

## Where it lives

- `dashboard/src/components/bottom-panel/BottomPanel.tsx:86`
  ```ts
  const sessionTasks = useMemo(() => deriveSessionTasks(events), [events]);
  ```
  This passes **all** events. There is no turn slice and no use of `viewingTurnNumber` or `turns`.

- `dashboard/src/lib/sessionTasks.ts` — derivation walks the full event list and returns the cumulative state. No turn awareness.

- For comparison, `dashboard/src/components/conversation/ConversationView.tsx:501-564` already builds `tasksByTurn` (a `Map<turnNumber, TaskItem[]>`) and passes the per-turn slice into `TurnCard` → `TaskGrid`. That logic should be the source of truth.

## Expected behavior

When `viewingTurnNumber` is set, the Tasks tab should show the task list **as of the end of that turn** — exactly what `TaskGrid` shows inline for that turn. When no turn is scoped (e.g., scope pill is "All"), show the current cumulative state.

## Fix sketch

1. Export the per-turn derivation from `ConversationView.tsx` into `lib/sessionTasks.ts` as `deriveTasksByTurn(events, turns)`.
2. In `BottomPanel.tsx`, pick the slice based on `viewingTurnNumber`:
   ```ts
   const tasksByTurn = useMemo(() => deriveTasksByTurn(events, turns), [events, turns]);
   const sessionTasks = useMemo(() => {
     if (viewingTurnNumber != null) {
       // last turn at or before viewingTurnNumber with task changes
       return tasksByTurn.get(viewingTurnNumber) ?? lastTaskListAtOrBefore(tasksByTurn, viewingTurnNumber);
     }
     return deriveSessionTasks(events);
   }, [tasksByTurn, viewingTurnNumber, events]);
   ```
3. Resolve the sidechain bug (separate ticket) so the cumulative slice doesn't mix subagent and main task lists.

## Acceptance criteria

- Scope pill "Scoped to T<N>" makes the Tasks tab show exactly what `TaskGrid` shows inside turn T<N>.
- Scope pill cleared → Tasks tab shows the cumulative latest state.
- Regression test in `BottomPanel.test.tsx` (or `sessionTasks.test.ts`): given events with TodoWrite changes across turns 1, 3, 5, the slice at turn 4 equals the turn-3 list.

## Severity

P1 — visible inconsistency vs. sibling tabs, but doesn't silently break automation. Cluster with the sidechain bug; fix together.
