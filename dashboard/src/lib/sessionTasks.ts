import type { SessionEvent } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";
import { getEventsForTurn } from "./turnSnapshot";

export interface SessionTask {
  id: string;             // display: "T-001"
  taskId?: string;        // internal: "1" (matches TaskUpdate.taskId). Optional for backward-compat with literals/mocks.
  name: string;           // subject || description || "Task N"
  status: "done" | "pending" | "in_progress" | "error";
  blockedBy?: string[];   // stored only — not rendered in Phase 1
}

const TASK_TOOLS = new Set(["TaskCreate", "TaskUpdate", "TaskList"]);

function normalizeStatus(s: unknown): SessionTask["status"] {
  if (s === "completed" || s === "done") return "done";
  if (s === "in_progress") return "in_progress";
  if (s === "error") return "error";
  return "pending";
}

function applyTaskToolUse(
  tasks: SessionTask[],
  toolUse: { name: string; input: Record<string, unknown> },
): SessionTask[] {
  if (toolUse.name === "TaskCreate") {
    const subject =
      typeof toolUse.input.subject === "string" ? toolUse.input.subject : undefined;
    const description =
      typeof toolUse.input.description === "string" ? toolUse.input.description : undefined;
    const taskId = String(tasks.length + 1);
    return [
      ...tasks,
      {
        id: `T-${taskId.padStart(3, "0")}`,
        taskId,
        name: subject ?? description ?? `Task ${tasks.length + 1}`,
        status: "pending",
      },
    ];
  }
  if (toolUse.name === "TaskUpdate") {
    const targetId =
      toolUse.input.taskId !== undefined ? String(toolUse.input.taskId) : undefined;
    if (!targetId) return tasks;
    return tasks.map((t) => {
      if (t.taskId !== targetId) return t;
      const next: SessionTask = { ...t };
      if (toolUse.input.status !== undefined) {
        next.status = normalizeStatus(toolUse.input.status);
      }
      if (Array.isArray(toolUse.input.addBlockedBy)) {
        const additions = (toolUse.input.addBlockedBy as unknown[]).map(String);
        next.blockedBy = [...(t.blockedBy ?? []), ...additions];
      }
      return next;
    });
  }
  // TaskList: explicit no-op
  return tasks;
}

function processToolUseItems(
  tasks: SessionTask[],
  content: unknown,
): { tasks: SessionTask[]; hadTaskTool: boolean } {
  if (!Array.isArray(content)) return { tasks, hadTaskTool: false };
  let next = tasks;
  let hadTaskTool = false;
  for (const item of content) {
    if (typeof item !== "object" || item === null || !("type" in item)) continue;
    if ((item as { type: string }).type !== "tool_use") continue;
    const toolUse = item as { type: "tool_use"; name: string; input: Record<string, unknown> };
    if (!TASK_TOOLS.has(toolUse.name)) continue;
    hadTaskTool = true;
    next = applyTaskToolUse(next, toolUse);
  }
  return { tasks: next, hadTaskTool };
}

/**
 * Derive the cumulative task list from session events.
 * Matches ConversationView per-turn logic but returns final state across all events.
 */
export function deriveSessionTasks(events: readonly SessionEvent[]): SessionTask[] {
  let tasks: SessionTask[] = [];
  for (const evt of events) {
    if (evt.type !== "assistant") continue;
    const content = evt.message?.content;
    const result = processToolUseItems(tasks, content);
    tasks = result.tasks;
  }
  return tasks;
}

/**
 * Derive per-turn cumulative task state. Only stores entries for turns that had
 * task tool calls (matches existing ConversationView semantics). Consumers should
 * use `getTasksAtTurn` to safely look up a slice for any turn number.
 */
export function deriveTasksByTurn(
  events: readonly SessionEvent[],
  turns: readonly TurnSnapshot[],
): Map<number, SessionTask[]> {
  const result = new Map<number, SessionTask[]>();
  let tasks: SessionTask[] = [];
  for (const turn of turns) {
    const turnEvents = getEventsForTurn(turn, events as SessionEvent[]);
    let turnHadTaskTools = false;
    for (const evt of turnEvents) {
      if (evt.type !== "assistant") continue;
      const r = processToolUseItems(tasks, evt.message?.content);
      tasks = r.tasks;
      if (r.hadTaskTool) turnHadTaskTools = true;
    }
    if (turnHadTaskTools && tasks.length > 0) {
      result.set(turn.turnNumber, [...tasks]);
    }
  }
  return result;
}

/**
 * Per-turn DELTA — for each turn, the subset of the cumulative task list that
 * was Created or Updated during that turn. The returned task objects carry
 * their POST-turn status (so a TaskUpdate(done) in turn N surfaces the task
 * with status=done in turn N's delta).
 *
 * Semantics:
 *   - TaskCreate always marks the new task as touched in the turn it was created.
 *   - TaskUpdate with a valid taskId always marks the targeted task as touched
 *     in the turn (the post-update state is what surfaces). Unknown taskId is
 *     naturally a no-op because the find() returns undefined.
 *   - TaskList alone never marks a turn as touched (read-only no-op per
 *     applyTaskToolUse).
 *   - Same-turn Create+Update collapses into one entry with the final status,
 *     because both operations touch the same id and we filter the cumulative
 *     state by the touched-id set.
 *   - Turns with no TaskCreate/TaskUpdate are absent from the returned map.
 */
export function deriveTasksTouchedInTurn(
  events: readonly SessionEvent[],
  turns: readonly TurnSnapshot[],
): Map<number, SessionTask[]> {
  const result = new Map<number, SessionTask[]>();
  let cumulative: SessionTask[] = [];

  for (const turn of turns) {
    const touchedIds = new Set<string>();
    const turnEvents = getEventsForTurn(turn, events as SessionEvent[]);

    for (const evt of turnEvents) {
      if (evt.type !== "assistant") continue;
      const content = evt.message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (typeof item !== "object" || item === null || !("type" in item)) continue;
        if ((item as { type: string }).type !== "tool_use") continue;
        const toolUse = item as {
          type: "tool_use";
          name: string;
          input: Record<string, unknown>;
        };
        if (toolUse.name !== "TaskCreate" && toolUse.name !== "TaskUpdate") continue;

        cumulative = applyTaskToolUse(cumulative, toolUse);

        if (toolUse.name === "TaskCreate") {
          // applyTaskToolUse appends — the newest entry is the last in the list.
          const newTask = cumulative[cumulative.length - 1];
          if (newTask) touchedIds.add(newTask.id);
        } else {
          // TaskUpdate — match by internal taskId field; unknown ids are no-ops.
          const targetId =
            toolUse.input.taskId !== undefined ? String(toolUse.input.taskId) : undefined;
          if (targetId) {
            const updated = cumulative.find((t) => t.taskId === targetId);
            if (updated) touchedIds.add(updated.id);
          }
        }
      }
    }

    if (touchedIds.size > 0) {
      result.set(
        turn.turnNumber,
        cumulative.filter((t) => touchedIds.has(t.id)),
      );
    }
  }

  return result;
}

/**
 * Safe accessor for the task list state at the end of a given turn.
 * Returns the snapshot of the highest turn ≤ turnNumber that had task tool calls.
 * Returns [] when no such turn exists.
 */
export function getTasksAtTurn(
  byTurn: Map<number, SessionTask[]>,
  turnNumber: number,
): SessionTask[] {
  let best: SessionTask[] = [];
  let bestKey = -Infinity;
  for (const [k, v] of byTurn) {
    if (k <= turnNumber && k > bestKey) {
      bestKey = k;
      best = v;
    }
  }
  return best;
}
