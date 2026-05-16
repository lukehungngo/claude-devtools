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
