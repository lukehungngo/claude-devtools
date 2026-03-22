import type {
  SessionEvent,
  SessionMetrics,
  SessionInfo,
  AggregatedTokens,
  TurnTokens,
  TaskSummary,
} from "../types.js";
import { buildAgentDAG } from "./dag-builder.js";
import { buildToolStats } from "./tool-stats.js";

// Pricing per million tokens (March 2026)
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

// Context window sizes per model
const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
};

export function calculateTokenCost(
  model: string,
  tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
): number {
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.includes(key.split("-").slice(0, -1).join("-")) || model.includes(key)
  )?.[1] || MODEL_PRICING["claude-sonnet-4-6"];

  return (
    (tokens.inputTokens * pricing.input) / 1_000_000 +
    (tokens.outputTokens * pricing.output) / 1_000_000 +
    (tokens.cacheWriteTokens * pricing.cacheWrite) / 1_000_000 +
    (tokens.cacheReadTokens * pricing.cacheRead) / 1_000_000
  );
}

function getContextWindowSize(model: string): number {
  // Check if model ID indicates 1M context (e.g., "claude-opus-4-6[1m]")
  if (model.includes("1m") || model.includes("1M")) {
    return 1_000_000;
  }
  for (const [key, size] of Object.entries(CONTEXT_WINDOW_SIZES)) {
    if (model.includes(key)) return size;
  }
  return 200_000; // default
}

function extractTasks(events: SessionEvent[]): TaskSummary {
  const tasks = new Map<string, string>(); // id -> status
  let todoList: { status: string }[] = [];

  for (const event of events) {
    if (event.type !== "assistant") continue;
    for (const content of event.message.content) {
      if (content.type !== "tool_use") continue;

      const input = content.input as Record<string, unknown>;

      if (content.name === "TaskCreate") {
        const id = String(tasks.size + 1);
        tasks.set(id, "pending");
      } else if (content.name === "TaskUpdate") {
        const taskId = String(input.taskId || input.task_id || "");
        const status = String(input.status || "pending");
        if (taskId) tasks.set(taskId, normalizeStatus(status));
      } else if (content.name === "TodoWrite") {
        const todos = input.todos as Array<{ status?: string }> | undefined;
        if (Array.isArray(todos)) {
          todoList = todos.map((t) => ({
            status: normalizeStatus(String(t.status || "pending")),
          }));
        }
      }
    }
  }

  // Combine tasks and todos
  const allStatuses = [
    ...Array.from(tasks.values()),
    ...todoList.map((t) => t.status),
  ];

  return {
    total: allStatuses.length,
    completed: allStatuses.filter((s) => s === "completed").length,
    inProgress: allStatuses.filter((s) => s === "in_progress").length,
    pending: allStatuses.filter((s) => s === "pending").length,
  };
}

function normalizeStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  if (s === "in_progress" || s === "running") return "in_progress";
  return "pending";
}

function detectRemoteControl(events: SessionEvent[]): boolean {
  for (const event of events) {
    // Check entrypoint field
    if ((event as unknown as Record<string, unknown>).entrypoint === "remote-control") {
      return true;
    }
    // Check for remote-control related events
    if (event.type === "user") {
      const content = event.message.content;
      for (const item of content) {
        if (item.type === "text" && item.text.includes("/remote-control")) {
          return true;
        }
      }
    }
  }
  return false;
}

export function computeMetrics(
  sessionInfo: SessionInfo,
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>
): SessionMetrics {
  const allEvents = [
    ...mainEvents,
    ...Array.from(subagentEvents.values()).flat(),
  ];

  // Aggregate tokens
  const tokensByModel: Record<string, AggregatedTokens> = {};
  const tokensByTurn: TurnTokens[] = [];
  const totalTokens: AggregatedTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
  };

  let turnIndex = 0;
  let cumulativeCost = 0;
  const models = new Set<string>();
  let lastInputTokens = 0; // last assistant event's input_tokens = current context usage

  for (const event of allEvents) {
    if (event.type !== "assistant") continue;
    const usage = event.message.usage;
    const model = event.message.model || "unknown";
    if (!usage) continue;

    models.add(model);

    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cost = calculateTokenCost(model, {
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: cacheWrite,
      cacheReadTokens: cacheRead,
    });

    totalTokens.inputTokens += input;
    totalTokens.outputTokens += output;
    totalTokens.cacheWriteTokens += cacheWrite;
    totalTokens.cacheReadTokens += cacheRead;
    totalTokens.totalCost += cost;

    // Track last input tokens (this represents context window usage for that turn)
    lastInputTokens = input + cacheRead;

    if (!tokensByModel[model]) {
      tokensByModel[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      };
    }
    tokensByModel[model].inputTokens += input;
    tokensByModel[model].outputTokens += output;
    tokensByModel[model].cacheWriteTokens += cacheWrite;
    tokensByModel[model].cacheReadTokens += cacheRead;
    tokensByModel[model].totalCost += cost;

    cumulativeCost += cost;
    tokensByTurn.push({
      index: turnIndex++,
      timestamp: event.timestamp,
      model,
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      cost,
      cumulativeCost,
    });
  }

  // Build DAG
  const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

  // Tool stats
  const tools = buildToolStats(allEvents);

  // Count tool calls
  let totalToolCalls = 0;
  for (const t of tools) totalToolCalls += t.count;

  // Duration — wall-clock time from first timestamped event to now (for active) or last event
  const firstTimestamped = mainEvents.find((e) => e.timestamp);
  const startTime = firstTimestamped
    ? new Date(firstTimestamped.timestamp).getTime()
    : 0;
  const isActive = sessionInfo.isActive;
  const lastTimestamped = [...mainEvents].reverse().find((e) => e.timestamp);
  const endTime = isActive
    ? Date.now()
    : lastTimestamped
      ? new Date(lastTimestamped.timestamp).getTime()
      : startTime;
  const duration = startTime > 0 ? endTime - startTime : 0;

  // Context window — use last assistant event's input tokens as current context usage
  const primaryModel = Array.from(models)[0] || "claude-sonnet-4-6";
  const contextWindowSize = getContextWindowSize(primaryModel);
  const contextPercent = contextWindowSize > 0
    ? Math.min(100, Math.round((lastInputTokens / contextWindowSize) * 100))
    : 0;

  // Tasks
  const tasks = extractTasks(allEvents);

  // Remote control
  const hasRemoteControl = detectRemoteControl(mainEvents);

  return {
    session: sessionInfo,
    dag,
    tokens: totalTokens,
    tokensByModel,
    tokensByTurn,
    tools,
    totalEvents: allEvents.length,
    totalToolCalls,
    totalAgents: 1 + subagentEvents.size,
    models: Array.from(models),
    duration,
    permissionMode: sessionInfo.permissionMode,
    contextPercent,
    contextWindowSize,
    tasks,
    hasRemoteControl,
  };
}
