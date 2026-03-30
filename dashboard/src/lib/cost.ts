/**
 * Per-model pricing table (per million tokens). March 2026.
 * Must be manually updated when Anthropic changes rates.
 * Mirrors server/src/analyzer/metrics.ts MODEL_PRICING.
 */
const MODEL_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-6"];

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
    Object.entries(MODEL_PRICING).find(
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
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
