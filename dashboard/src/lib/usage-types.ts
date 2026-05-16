/**
 * Types for the per-model + cache-hit-ratio Usage breakdown (TASK-B5 / P2-10).
 * Kept in a dedicated module to avoid editing types.ts (B1 owns that file).
 */

export interface PerModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** cache_read / (input + cache_read + cache_create); 0 if denominator is 0. */
  cacheHitRatio: number;
  totalCost: number;
}

export interface UsageBreakdown {
  perModel: PerModelUsage[];
  totalCost: number;
}
