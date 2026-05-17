import { FALLBACK_MODEL_PRICING } from "./modelPricing";
import {
  deriveObservedContextWindow,
  type ContextWindowEvent,
} from "./contextWindow";

const DEFAULT_PRICING = FALLBACK_MODEL_PRICING["claude-sonnet-4-6"];

/**
 * Calculate turn cost using per-model pricing (including cache tokens).
 * Falls back to sonnet pricing for unknown models.
 */
export function calculateTurnCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
): number {
  const pricing =
    Object.entries(FALLBACK_MODEL_PRICING).find(
      ([key]) =>
        model.includes(key) ||
        model.includes(key.split("-").slice(0, -1).join("-"))
    )?.[1] ?? DEFAULT_PRICING;

  return (
    (inputTokens * pricing.input) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000 +
    (cacheWriteTokens * pricing.cacheWrite) / 1_000_000 +
    (cacheReadTokens * pricing.cacheRead) / 1_000_000
  );
}

function getContextWindowSize(
  _model: string,
  observedEvents: readonly ContextWindowEvent[],
): number {
  // Observation-derived window — see docs/bugs/context-window-hardcoded-guesswork.md.
  // No model-name heuristics, no per-model magic numbers. The dashboard has no
  // access to the persistent SDK cache (server-only); SDK live values take the
  // sdkContextWindow path. This function is the universal fallback.
  return deriveObservedContextWindow(observedEvents);
}

export interface LiveMetrics {
  duration: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  contextPercent: number;
  contextWindowSize: number;
  models: string[];
  totalAgents: number;
}

/**
 * Derive live metrics from events — event-driven replacement for REST polling.
 * Computes duration, cost, context%, models from the raw event stream.
 */
export function computeLiveMetrics(
  events: Array<{ type: string; timestamp: string; message?: Record<string, unknown>; agentId?: string }>,
  isLive: boolean,
  sdkContextWindow?: number,
): LiveMetrics {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;
  let lastInputTokens = 0;
  const models = new Set<string>();
  const agents = new Set<string>();
  agents.add("main");

  for (const event of events) {
    if (event.agentId && event.agentId !== "main") {
      agents.add(event.agentId);
    }
    if (event.type !== "assistant") continue;
    const msg = event.message as {
      model?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    } | undefined;
    if (!msg?.usage) continue;

    const model = msg.model || "claude-sonnet-4-6";
    models.add(model);

    const input = msg.usage.input_tokens || 0;
    const output = msg.usage.output_tokens || 0;
    const cacheWrite = msg.usage.cache_creation_input_tokens || 0;
    const cacheRead = msg.usage.cache_read_input_tokens || 0;

    inputTokens += input;
    outputTokens += output;
    totalCost += calculateTurnCost(model, input, output, cacheWrite, cacheRead);
    lastInputTokens = input + cacheWrite + cacheRead;
  }

  // Duration — scan for first event with a non-empty timestamp to avoid 0ms
  let duration = 0;
  if (events.length > 0) {
    const firstTs = events.find((e) => e.timestamp)?.timestamp ?? null;
    const startTime = firstTs ? new Date(firstTs).getTime() : 0;
    if (startTime > 0) {
      let lastTs: string | undefined;
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].timestamp) { lastTs = events[i].timestamp; break; }
      }
      const endTime = isLive
        ? Date.now()
        : lastTs ? new Date(lastTs).getTime() : startTime;
      duration = endTime - startTime;
    }
  }

  // Context % — use SDK authoritative value when available, fall back to observation-derived window
  const primaryModel = Array.from(models)[0] || "claude-sonnet-4-6";
  const contextWindowSize = sdkContextWindow || getContextWindowSize(primaryModel, events);
  const contextPercent = contextWindowSize > 0
    ? Math.min(100, Math.round((lastInputTokens / contextWindowSize) * 100))
    : 0;

  return {
    duration,
    totalCost,
    inputTokens,
    outputTokens,
    contextPercent,
    contextWindowSize,
    models: Array.from(models),
    totalAgents: agents.size,
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${Math.round(count / 1_000_000)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return count.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 86_400_000) {
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    return `${d}d ${h}h`;
  }
  if (ms >= 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
