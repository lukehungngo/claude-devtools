import { loadFullSession } from "../../parser/session-discovery.js";
import { calculateTokenCost } from "../metrics.js";
import { buildDetectorContext } from "./detector-context.js";
import { detectWastedRetries } from "./wasted-retries.js";
import { detectBlindEdits } from "./blind-edits.js";
import { detectSessionFragmentation } from "./session-fragmentation.js";
import { detectCostWaste } from "./cost-waste.js";
import { detectModelOveruse } from "./model-overuse.js";
import { detectCacheMisses } from "./cache-misses.js";
import { detectImprovingTrend } from "./improving-trend.js";
import { rankAndFormat } from "./hint-ranker.js";
import type { HintsResponse, EvidenceResponse, PatternResult, SessionWithEvents } from "./types.js";
import type { SessionInfo } from "../../types.js";

function loadEvents(sessions: SessionInfo[]): SessionWithEvents[] {
  return sessions.map((info) => {
    const { mainEvents } = loadFullSession(info);
    return { info, mainEvents };
  });
}

const cachedResults: Map<string, PatternResult[]> = new Map();

export function computeHints(range: "24h" | "7d" | "30d" | "90d"): HintsResponse {
  const ctx = buildDetectorContext(range);
  const sessionsWithEvents = loadEvents(ctx.sessions);
  const priorWithEvents = loadEvents(ctx.priorSessions);

  const results: PatternResult[] = [
    detectWastedRetries(sessionsWithEvents),
    detectBlindEdits(sessionsWithEvents),
    detectSessionFragmentation(ctx.sessions),
    detectCostWaste(sessionsWithEvents),
    detectModelOveruse(sessionsWithEvents),
    detectCacheMisses(sessionsWithEvents),
    detectImprovingTrend(sessionsWithEvents, priorWithEvents),
  ];

  cachedResults.set(range, results);

  let totalCost = 0;
  for (const s of sessionsWithEvents) {
    for (const ev of s.mainEvents) {
      if (ev.type === "assistant") {
        totalCost += calculateTokenCost(ev.message.model, {
          inputTokens: ev.message.usage.input_tokens,
          outputTokens: ev.message.usage.output_tokens,
          cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
        });
      }
    }
  }

  return {
    range,
    hints: rankAndFormat(results, range),
    sessionCount: ctx.sessions.length,
    totalCost,
  };
}

export function getEvidence(hintId: string): EvidenceResponse | undefined {
  // hintId format: "{category}-{range}"
  const lastDash = hintId.lastIndexOf("-");
  if (lastDash === -1) return undefined;

  const range = hintId.slice(lastDash + 1);
  const category = hintId.slice(0, lastDash);

  const results = cachedResults.get(range);
  if (!results) {
    // Try all cached ranges as fallback
    for (const [, rs] of cachedResults) {
      const result = rs.find((r) => hintId.startsWith(r.category));
      if (result) {
        return { hintId, category: result.category, evidence: result.evidence };
      }
    }
    return undefined;
  }

  const result = results.find((r) => r.category === category);
  if (!result) return undefined;
  return { hintId, category: result.category, evidence: result.evidence };
}

/** Reset cache — for testing only */
export function __resetCache(): void {
  cachedResults.clear();
}
