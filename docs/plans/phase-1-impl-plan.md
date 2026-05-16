# Phase 1 Implementation Plan

**Spec:** `docs/specs/phase-1-task-derivation.md` (Step 2 approved with REVISE → fixes applied)
**Status:** ready · **Owner:** main session · **Blocked on:** other agent on repo

---

## Pre-flight

Before any file edits:

```bash
cd /Users/soh/working/ai/claude-devtools
git status
git diff dashboard/src/lib/sessionTasks.ts
git diff dashboard/src/components/conversation/ConversationView.tsx
git diff dashboard/src/components/bottom-panel/BottomPanel.tsx
git log -3 --oneline
```

If concurrent edits exist on any of the three target files, STOP and rebase before continuing.

---

## Tasks (TDD order)

### T1 — Write failing tests first

**File:** `dashboard/src/lib/sessionTasks.test.ts` (new)

Add Fixtures A through J from the spec. Each fixture is one `it()` block. Use minimal `SessionEvent` literals.

Acceptance: `pnpm -C dashboard test sessionTasks` fails with 10 red tests (because handlers don't exist yet).

### T2 — Implement core derivation

**File:** `dashboard/src/lib/sessionTasks.ts` — rewrite

Structure:

```ts
const TASK_TOOLS = new Set(["TaskCreate", "TaskUpdate", "TaskList"]);
// NOTE: TodoWrite branch removed — 0/199k corpus calls. Recover from git if needed.

function normalizeStatus(s: unknown): SessionTask["status"] { ... }

function applyTaskToolUse(tasks: SessionTask[], toolUse: { name: string; input: Record<string, unknown> }): SessionTask[] {
  if (toolUse.name === "TaskCreate") {
    const subject = typeof toolUse.input.subject === "string" ? toolUse.input.subject : undefined;
    const description = typeof toolUse.input.description === "string" ? toolUse.input.description : undefined;
    const name = subject ?? description ?? `Task ${tasks.length + 1}`;
    const taskId = String(tasks.length + 1);
    const id = `T-${taskId.padStart(3, "0")}`;
    return [...tasks, { id, taskId, name, status: "pending" }];
  }
  if (toolUse.name === "TaskUpdate") {
    const targetId = String(toolUse.input.taskId);
    return tasks.map(t => {
      if (t.taskId !== targetId) return t;
      const next: SessionTask = { ...t };
      if (toolUse.input.status !== undefined) next.status = normalizeStatus(toolUse.input.status);
      if (Array.isArray(toolUse.input.addBlockedBy)) {
        next.blockedBy = [...(t.blockedBy ?? []), ...toolUse.input.addBlockedBy.map(String)];
      }
      return next;
    });
  }
  if (toolUse.name === "TaskList") return tasks; // explicit no-op
  return tasks;
}

export function deriveSessionTasks(events: readonly SessionEvent[]): SessionTask[] {
  let tasks: SessionTask[] = [];
  for (const evt of events) {
    if (evt.type !== "assistant") continue;
    const content = evt.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== "object" || item === null || !("type" in item)) continue;
      if ((item as any).type !== "tool_use") continue;
      const toolUse = item as { type: "tool_use"; name: string; input: Record<string, unknown> };
      if (!TASK_TOOLS.has(toolUse.name)) continue;
      tasks = applyTaskToolUse(tasks, toolUse);
    }
  }
  return tasks;
}

export function deriveTasksByTurn(
  events: readonly SessionEvent[],
  turns: readonly TurnSnapshot[]
): Map<number, SessionTask[]> {
  const result = new Map<number, SessionTask[]>();
  let tasks: SessionTask[] = [];
  for (const turn of turns) {
    const turnEvents = getEventsForTurn(turn, events);
    let turnHadTaskTools = false;
    for (const evt of turnEvents) {
      if (evt.type !== "assistant") continue;
      const content = evt.message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (typeof item !== "object" || item === null || !("type" in item)) continue;
        if ((item as any).type !== "tool_use") continue;
        const toolUse = item as { type: "tool_use"; name: string; input: Record<string, unknown> };
        if (!TASK_TOOLS.has(toolUse.name)) continue;
        turnHadTaskTools = true;
        tasks = applyTaskToolUse(tasks, toolUse);
      }
    }
    if (turnHadTaskTools && tasks.length > 0) {
      result.set(turn.turnNumber, [...tasks]); // freeze snapshot
    }
  }
  return result;
}

export function getTasksAtTurn(byTurn: Map<number, SessionTask[]>, turnNumber: number): SessionTask[] {
  let best: SessionTask[] = [];
  let bestKey = -Infinity;
  for (const [k, v] of byTurn) {
    if (k <= turnNumber && k > bestKey) { bestKey = k; best = v; }
  }
  return best;
}
```

Acceptance: all 10 tests in T1 pass.

### T3 — Wire BottomPanel to turn-scoped derivation

**File:** `dashboard/src/components/bottom-panel/BottomPanel.tsx`

Replace line 86:
```ts
// before:
const sessionTasks = useMemo(() => deriveSessionTasks(events), [events]);

// after:
const tasksByTurn = useMemo(
  () => deriveTasksByTurn(events, turns),
  [events, turns]
);
const sessionTasks = useMemo(
  () => viewingTurnNumber !== undefined
    ? getTasksAtTurn(tasksByTurn, viewingTurnNumber)
    : deriveSessionTasks(events),
  [tasksByTurn, viewingTurnNumber, events]
);
```

Import `deriveTasksByTurn` and `getTasksAtTurn` alongside `deriveSessionTasks`.

Acceptance: existing `BottomPanel.test.tsx` stays green. Add one new test: pass `viewingTurnNumber={3}` with task fixture spanning turns 1/3/5 → TasksTab receives turn-3 slice.

### T4 — Migrate ConversationView to shared function

**File:** `dashboard/src/components/conversation/ConversationView.tsx`

Replace the inline `tasksByTurn` block (lines 499-564) with a single call:

```ts
const tasksByTurn = useMemo(
  () => deriveTasksByTurn(events, turns),
  [events, turns]
);
```

Remove the local `TaskItem` type alias and `normalizeStatus` helper — both now live in `lib/sessionTasks.ts`.

Update `TurnCard` prop typing if it expected the local `TaskItem` shape — should be structurally compatible with `SessionTask` (id, name, status; ignore unused fields like `taskId`, `blockedBy`).

Acceptance:
- `ConversationView.test.tsx` "ConversationView TaskGrid derived from events" block stays green.
- New test from Fixture J: same-turn TaskCreate + TaskUpdate → TaskGrid renders `status: "done"` for that task.

### T5 — Type & lint check

```bash
cd dashboard
pnpm -C dashboard test
npx tsc --noEmit
```

Both must be clean.

### T6 — Smoke test against real session

```bash
# Start dashboard pointed at the verified session
pnpm -C dashboard dev
# Open browser, load session 23ba0306, navigate to TasksTab
# Expected: at least 1 task shows "done" status (matches CLI display)
```

If the count still reads `0/N completed`, return to gap review.

---

## Risk gates

| Gate | Pass | Fail |
|---|---|---|
| T1 — tests written | 10 red tests | revise spec |
| T2 — core impl | 10 tests green | iterate impl |
| T3 — BottomPanel wire | existing+new tests green | revise wiring |
| T4 — ConversationView swap | existing+Fixture J green | check structural compat |
| T5 — typecheck/lint | clean | fix types |
| T6 — smoke | "0/N completed" → real count | gap review (Step 5) |

---

## Out of scope (re-confirmed)

- Visual changes to TasksTab beyond what's needed for `SessionTask` shape (already done this session)
- Reading `tool_result.taskId` for non-sequential robustness (Phase 1.5)
- Rendering `blockedBy` field (Phase 1.5+)
- Inline-style audit of touched files (Phase 2)

---

## Execution mode

- **No subagent needed.** Total LOC change ≈ 200 across 4 files, fits in current context.
- **Single PR scope.** Don't split T1-T6 across PRs; the test harness only makes sense atomically.
- **Branch:** `phase-1-task-derivation` (or whatever fits team convention).
