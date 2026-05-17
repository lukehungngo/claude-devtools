/**
 * Dashboard mirror of server/src/analyzer/modelPricing.ts.
 *
 * KEEP IN SYNC: the parity test at
 *   dashboard/src/lib/modelPricing.parity.test.ts
 * reads both files and asserts the maps are identical. Update both files
 * together whenever Anthropic pricing changes or a new model ships.
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

export const FALLBACK_MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

/**
 * Standard 200K context window — used as the safe default by
 * deriveObservedContextWindow when no assistant event has been observed yet.
 *
 * The static per-model FALLBACK_CONTEXT_WINDOW_SIZES map and the
 * ONE_MILLION_CONTEXT substring heuristic were removed on 2026-05-17 — both
 * were guesswork keyed on model-name strings that frequently didn't match the
 * runtime model id. See docs/bugs/context-window-hardcoded-guesswork.md.
 *
 * Sources of truth for context window, in priority order:
 *   1. SDK live `result.modelUsage[model].contextWindow` (authoritative).
 *   2. Observation-derived window from this session's assistant usage.
 *   3. DEFAULT_CONTEXT_WINDOW (this constant) when no observations exist.
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;
