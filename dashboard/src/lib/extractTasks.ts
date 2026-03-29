import type { SessionEvent } from "./types";

export interface TodoTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  description?: string;
}

function normalizeStatus(status: string): TodoTask["status"] {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  if (s === "in_progress" || s === "running") return "in_progress";
  return "pending";
}

/**
 * Extract tasks from session events by finding the last TodoWrite tool_use.
 * TodoWrite is a full-replacement call — the last one wins.
 */
export function extractTasks(events: SessionEvent[]): TodoTask[] {
  let lastTodos: TodoTask[] = [];

  for (const event of events) {
    if (event.type !== "assistant") continue;
    const content = event.message.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item.type !== "tool_use" || item.name !== "TodoWrite") continue;

      const input = item.input as Record<string, unknown>;
      // Accept both "todos" and "tasks" keys
      const rawList = input.todos ?? input.tasks;
      if (!Array.isArray(rawList)) continue;

      lastTodos = rawList.map((t: Record<string, unknown>, idx: number) => ({
        id: String(t.id ?? idx + 1),
        title: String(t.title ?? "Untitled"),
        status: normalizeStatus(String(t.status ?? "pending")),
        description: t.description ? String(t.description) : undefined,
      }));
    }
  }

  return lastTodos;
}
