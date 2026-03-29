/**
 * Per-model pricing table (per million tokens). March 2026.
 * Must be manually updated when Anthropic changes rates.
 * Mirrors server/src/analyzer/metrics.ts MODEL_PRICING (input/output only).
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-6"];

/**
 * Calculate turn cost using per-model pricing.
 * Falls back to sonnet pricing for unknown models.
 */
export function calculateTurnCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing =
    Object.entries(MODEL_PRICING).find(
      ([key]) =>
        model.includes(key) ||
        model.includes(key.split("-").slice(0, -1).join("-"))
    )?.[1] ?? DEFAULT_PRICING;

  return (
    (inputTokens * pricing.input) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000
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
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
