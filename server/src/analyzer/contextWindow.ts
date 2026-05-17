import type { SessionEvent } from "../types.js";

const STANDARD_CONTEXT_WINDOW = 200_000;
const EXTENDED_CONTEXT_WINDOW = 1_000_000;

/**
 * Observation-derived context window per session.
 *
 * Walks assistant events and computes max(input + cache_read + cache_create).
 * Buckets to known Anthropic ceilings: any observation above 200K means the
 * session is on the extended-context (1M) tier. Returns the standard 200K
 * window when nothing exceeds it (or when there are no assistant events yet).
 *
 * This is universal and authoritative per-session — no model-name string
 * matching, no hardcoded magic numbers tied to specific models.
 */
export function deriveObservedContextWindow(
  events: readonly SessionEvent[],
): number {
  let max = 0;
  for (const evt of events) {
    if (evt.type !== "assistant") continue;
    const usage = (
      evt as {
        message?: {
          usage?: {
            input_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        };
      }
    ).message?.usage;
    if (!usage) continue;
    const sum =
      (usage.input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0);
    if (sum > max) max = sum;
  }
  if (max > STANDARD_CONTEXT_WINDOW) return EXTENDED_CONTEXT_WINDOW;
  return STANDARD_CONTEXT_WINDOW;
}
