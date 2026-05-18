/**
 * Categorise a tool name into one of four buckets so the conversation panel
 * can show signal and hide noise.
 *
 *   - "spawn":      fan-out into a subagent. Always shown, one row each.
 *   - "state":      mutates the world (filesystem, shell). Always shown.
 *   - "routine":    read-only inspection. Collapsed into a chip per turn.
 *   - "accounting": agent's own ledger (task list, todos). Collapsed into a
 *                   separate chip per turn.
 *
 * Unknown tool names default to "routine" — visible via chip, never hidden.
 */

export type ToolCategory = "spawn" | "state" | "routine" | "accounting";

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  // Spawn — subagent dispatch
  Task: "spawn",
  Agent: "spawn",
  dispatch_agent: "spawn",

  // State change — mutates files or shell state
  Edit: "state",
  Write: "state",
  MultiEdit: "state",
  NotebookEdit: "state",
  Bash: "state",
  Delete: "state",

  // Routine read-only inspection
  Read: "routine",
  Glob: "routine",
  Grep: "routine",
  LS: "routine",
  BashOutput: "routine",
  NotebookRead: "routine",
  WebFetch: "routine",
  WebSearch: "routine",

  // Internal accounting / planner
  TaskCreate: "accounting",
  TaskUpdate: "accounting",
  TaskGet: "accounting",
  TaskList: "accounting",
  TaskOutput: "accounting",
  TaskStop: "accounting",
  TodoWrite: "accounting",
};

export function classifyToolCall(name: string): ToolCategory {
  return TOOL_CATEGORY[name.trim()] ?? "routine";
}

/**
 * Human-readable plural form for a tool name in a chip — "reads", "task updates",
 * "globs", etc. Lower-case so chip text reads naturally as a comma list.
 */
const TOOL_LABEL_PLURAL: Record<string, string> = {
  Read: "reads",
  Glob: "globs",
  Grep: "greps",
  LS: "ls",
  BashOutput: "bash outputs",
  NotebookRead: "notebook reads",
  WebFetch: "web fetches",
  WebSearch: "web searches",
  TaskCreate: "task creates",
  TaskUpdate: "task updates",
  TaskGet: "task gets",
  TaskList: "task lists",
  TaskOutput: "task outputs",
  TaskStop: "task stops",
  TodoWrite: "todo writes",
};

const TOOL_LABEL_SINGULAR: Record<string, string> = {
  Read: "read",
  Glob: "glob",
  Grep: "grep",
  LS: "ls",
  BashOutput: "bash output",
  NotebookRead: "notebook read",
  WebFetch: "web fetch",
  WebSearch: "web search",
  TaskCreate: "task create",
  TaskUpdate: "task update",
  TaskGet: "task get",
  TaskList: "task list",
  TaskOutput: "task output",
  TaskStop: "task stop",
  TodoWrite: "todo write",
};

export function toolLabel(name: string, count: number): string {
  if (count === 1) {
    return TOOL_LABEL_SINGULAR[name] ?? name.toLowerCase();
  }
  return TOOL_LABEL_PLURAL[name] ?? `${name.toLowerCase()}s`;
}
