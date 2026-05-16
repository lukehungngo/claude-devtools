/**
 * Single source of truth for Anthropic model pricing and context windows
 * (server side). The dashboard mirror lives at dashboard/src/lib/modelPricing.ts.
 *
 * A parity test (server/src/analyzer/modelPricing.parity.test.ts) reads both
 * files and asserts the maps are identical. Update both files together.
 *
 * Authoritative: prefer SDK `result.modelUsage[model].costUSD` and
 * `result.modelUsage[model].contextWindow` over these fallbacks.
 *
 * Anthropic pricing: https://www.anthropic.com/pricing
 * Last verified: 2026-05-16 against Anthropic public pricing page.
 */
export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Per-million-tokens. */
export const FALLBACK_MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

export const FALLBACK_CONTEXT_WINDOW_SIZES: Record<string, number> = {
  "claude-opus-4-7": 1_000_000,
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
};

export const DEFAULT_CONTEXT_WINDOW = 200_000;
export const ONE_MILLION_CONTEXT = 1_000_000;
