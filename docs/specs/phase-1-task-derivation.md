# Phase 1 Spec — Task derivation fix

**Loop step:** 1 of 5 · **Status:** drafting · **Owner:** main session
**Verified bug evidence:** `docs/bugs/task-derivation-gaps.md`, `docs/bugs/tasks-not-scoped-to-turn.md`
**Synthesis:** `docs/plans/SESSION-SYNTHESIS.md`

---

## Goal

Make the dashboard's task list reflect the **real** task tools used by this Claude Code variant (`TaskCreate` / `TaskUpdate` / `TaskList`), display the right task title, propagate status updates, and respect the active turn scope.

User-visible target: bottom Tasks tab transitions `0/11 completed` → correct counts (matching what the CLI shows) as `TaskUpdate` events arrive.

---

## Verified ground truth (do not re-litigate)

- `TaskCreate` input: `{ subject, description, activeForm? }`. `subject` is `"TASK-001: …"` style human title. 61 calls across 21 sessions.
- `TaskUpdate` input: `{ taskId, status?, addBlockedBy?, description? }`. `taskId` is server-assigned sequential string `"1", "2", …`. 110 calls.
- **Sequential taskId binding is verified, not assumed.** Every `TaskUpdate(taskId=N)` arrives strictly after the Nth `TaskCreate` in the same session. **110/110 pass** across 21 sessions. The "v1 sequential strategy" is now a verified fact.
- `addBlockedBy` is a real scenario, not hypothetical. **5 calls observed** across 2 sessions, all with `keys=[taskId, addBlockedBy]` and **no status**. They establish task dependencies without status changes.
- `TaskList` input: `{}`. Idempotent no-op.
- `TodoWrite`: 0 calls in 199k events — **delete the branch.** Forward-compat speculation isn't worth the dead surface. Git history preserves recovery.
- Sidechain events: 0/199k — **no contamination risk**, drop all `isSidechain` filter discussion.
- Status values observed: `"in_progress"`, `"completed"` only.

---

## Scope (4 items, one PR)

### 1.1 — Add `TaskUpdate` handler

**Today:** `TASK_TOOLS` lists `TaskUpdate` but the `if/else if` chain in `sessionTasks.ts` has no branch. 107 status updates per session silently dropped.

**Behavior:**
- On `TaskUpdate({ taskId, status })`:
  - Find the existing task whose `taskId` matches.
  - Replace its `status` via `normalizeStatus(status)` **only when `status` is present**.
  - If `taskId` doesn't match any known task (rare — out-of-order events, mid-session join), no-op (don't create a phantom task).
- On `TaskUpdate({ taskId, addBlockedBy })` with no status: store `blockedBy: string[]` on the task. Don't change status. (Real scenario — 5/110 observed.)
- `description` updates: ignore in v1 (1/110 observed — record as known limitation).

### 1.2 — Use `subject` for task name; fall back to `description`

**Today:** `TaskCreate` reads `input.description` → panel shows the long-form prompt body.

**Behavior:**
- Prefer `subject` when present (matches CLI display).
- Fall back to `description`, then `"Task N"` placeholder.
- Preserve current case where `subject` is missing (4/56 calls in the corpus).

### 1.3 — Stable `taskId` binding (sequential, verified)

**Today:** `id: T-${tasks.length + 1}` (positional). `TaskUpdate.taskId` is `"1", "2", …`. No mapping exists.

**Strategy (verified by 110/110 corpus check):**
- Each `SessionTask` gains an internal `taskId: string` field equal to `String(tasks.length + 1)` at create time.
- The displayed `id: "T-001"` is derived from `taskId` for human eyes.
- `TaskUpdate` lookup: `tasks.find(t => t.taskId === input.taskId)`.

**Robustness note:** sequential holds for fresh sessions and live streaming. If `--resume` mid-task is ever introduced, this can break — re-verify before relying on it for resumed sessions.

### 1.4 — Turn-scoped bottom Tasks tab + shared derivation

**Today:** `BottomPanel.tsx:86` calls `deriveSessionTasks(events)` regardless of `viewingTurnNumber`. Other tabs respect the scope.

**Behavior:**
- Export `deriveTasksByTurn(events, turns)` and `getTasksAtTurn(byTurn, n)` from `lib/sessionTasks.ts`.
- Move logic from `ConversationView.tsx:499-564` into `lib/sessionTasks.ts`. Identical observable behavior, except now with the TaskUpdate branch from 1.1.
- In `BottomPanel`: if `viewingTurnNumber` is set, use `getTasksAtTurn(byTurn, viewingTurnNumber)`; else use `deriveSessionTasks(events)`.
- `ConversationView`'s in-turn `TaskGrid` switches to the shared function.

**Explicit behavior change to flag:** before this PR, `TaskGrid` only saw the cumulative TodoWrite snapshot per turn (no real status updates were ever applied — the bug). **After this PR, `TaskGrid` will reflect in-turn `TaskUpdate` status changes inline.** This is the intended fix, not a regression.

---

## API contract

```ts
// dashboard/src/lib/sessionTasks.ts

export interface SessionTask {
  id: string;             // display: "T-001"
  taskId?: string;        // internal: "1" (matches TaskUpdate.taskId). Optional for backward-compat with existing literals/mocks.
  name: string;           // subject || description || "Task N"
  status: "done" | "pending" | "in_progress" | "error";
  blockedBy?: string[];   // Phase 1: stored only, no consumer reads it (rendered in Phase 1.5+)
}

export function deriveSessionTasks(events: readonly SessionEvent[]): SessionTask[];

export function deriveTasksByTurn(
  events: readonly SessionEvent[],
  turns: readonly TurnSnapshot[]
): Map<number, SessionTask[]>;

// Helper: find the task list state as-of the end of `turnNumber`.
// `deriveTasksByTurn` only stores entries for turns that *had* task tool calls
// (matches current ConversationView behavior). This walks ≤turnNumber.
export function getTasksAtTurn(
  byTurn: Map<number, SessionTask[]>,
  turnNumber: number
): SessionTask[];
```

`deriveSessionTasks` returns the cumulative final state. `deriveTasksByTurn` returns the state as-of each turn that had task tool calls. `getTasksAtTurn` is the safe accessor for BottomPanel — returns `[]` when no turn ≤ N had task tools.

---

## Acceptance criteria (test fixtures)

1. **Fixture A — basic create+update flow:** 1 TaskCreate (`subject: "TASK-001: foo"`) + 1 TaskUpdate (`taskId: "1", status: "completed"`) → derivation yields `[{ id: "T-001", taskId: "1", name: "TASK-001: foo", status: "done" }]`.
2. **Fixture B — interleaved:** 3 TaskCreates then 3 TaskUpdates targeting them in mixed order → all three reflect correct status.
3. **Fixture C — `addBlockedBy` stores dependency without changing status:** TaskUpdate with `{ taskId: "3", addBlockedBy: ["1"] }` and no status → task 3 retains its prior status and gains `blockedBy: ["1"]`. Verified-real scenario, 5/110 in corpus.
4. **Fixture D — missing subject:** TaskCreate with `{ description: "long body…" }` only → name falls back to description.
5. **Fixture E — turn scope:** events span turns 1, 3, 5 with task tool calls in each. `deriveTasksByTurn(events, turns).get(4)` returns the turn-3 list.
6. **Fixture F — empty:** zero events → empty list, no crash.
7. **Fixture G — TaskList no-op:** `TaskList({})` doesn't alter the task list.
8. **Fixture H — unknown taskId in TaskUpdate:** Update referencing taskId "99" with no matching create → no-op, no phantom task.
9. **Fixture I — content-array order within one assistant message:** TaskCreate + TaskUpdate({taskId:"1"}) in the SAME assistant message's content array (TaskCreate before TaskUpdate) → status applied correctly. Asserts content items are processed in array order.
10. **Fixture J — TaskGrid reflects same-turn TaskUpdate:** Single turn with TaskCreate then TaskUpdate(completed) → `tasksByTurn.get(turn)` returns the task with `status: "done"`. Asserts the explicit behavior change in 1.4.

### Existing test suites must stay green

- `TasksTab.test.tsx` (5 tests) — already migrated to `SessionTask` shape.
- `ConversationView.test.tsx` (TaskGrid derived tasks block) — will be re-pointed at the shared function.
- `RepoList.test.tsx` (10 tests) — unrelated; must not regress.

---

## Out of scope (Phase 1)

- Reading `tool_result.taskId` for robust ID mapping (defer to Phase 1.5 if v1's sequential assumption proves wrong on resume).
- `addBlockedBy` rendering as a "blocked" status.
- Subagent-related task derivation (Phase 3).
- Visual polish of TasksTab (Phase 4).
- Active Only auto-refresh (Phase 5).

---

## Risks

- **Sequential assumption** may break if a session is started via `--resume` mid-task. Mitigation: log a warning when `TaskUpdate.taskId` doesn't match. Phase 1.5 patches with tool_result reading if needed.
- **Other agent on repo:** `sessionTasks.ts` (72 lines) was modified earlier this session. Another agent is also active. Phase 1 implementation will fully rewrite this file, so:
  - Before starting Step 4, run `git status` + `git diff dashboard/src/lib/sessionTasks.ts` to capture any concurrent edits.
  - Phase 1 author owns the rewrite; concurrent edits must be re-applied on top during Step 5 gap review.
  - If the other agent merges to master first, rebase Phase 1 against their changes before executing.

---

## Loop status

- [x] Step 1: Spec drafted
- [x] Step 2: Spec review — **REVISE issued, all 5 concerns applied:**
  - Added `getTasksAtTurn` helper to API contract
  - Marked `taskId` optional (non-breaking)
  - Explicit behavior-change note: TaskGrid will newly reflect TaskUpdate inline
  - Deleted TodoWrite forward-compat branch + Fixture G
  - Coordination/rebase steps spelled out under Risks
  - Added Fixtures I and J for content-array order + same-turn TaskUpdate
- [x] Step 3: Implementation plan → `docs/plans/phase-1-impl-plan.md` (T1-T6, TDD order)
- [ ] Step 4: Execute (blocked: other agent on repo)
- [ ] Step 5: Gap review (loop back if needed)
