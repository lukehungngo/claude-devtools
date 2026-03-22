import type {
  SessionEvent,
  SessionMetrics,
  SessionInfo,
  AggregatedTokens,
  TurnTokens,
  AssistantEvent,
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

export function calculateTokenCost(
  model: string,
  tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
): number {
  // Find matching pricing by prefix
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.includes(key.split("-").slice(0, -1).join("-")) || model.includes(key)
  )?.[1] || MODEL_PRICING["claude-sonnet-4-6"]; // default to sonnet

  return (
    (tokens.inputTokens * pricing.input) / 1_000_000 +
    (tokens.outputTokens * pricing.output) / 1_000_000 +
    (tokens.cacheWriteTokens * pricing.cacheWrite) / 1_000_000 +
    (tokens.cacheReadTokens * pricing.cacheRead) / 1_000_000
  );
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
  let totalTokens: AggregatedTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
  };

  let turnIndex = 0;
  let cumulativeCost = 0;
  const models = new Set<string>();

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

  // Duration
  const timestamps = allEvents
    .map((e) => new Date(e.timestamp).getTime())
    .filter((t) => !isNaN(t));
  const duration =
    timestamps.length > 1
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

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
  };
}
