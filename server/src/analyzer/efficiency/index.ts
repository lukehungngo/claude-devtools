import { loadFullSession } from "../../parser/session-discovery.js";
import { calculateTokenCost } from "../metrics.js";
import { buildDetectorContext } from "./detector-context.js";
import { detectEditRejectionRate } from "./edit-rejection-rate.js";
import { detectToolFailureStorm } from "./tool-failure-storm.js";
import { detectCacheHitRatio } from "./cache-hit-ratio.js";
import { detectCostPerLocOutlier } from "./cost-per-loc-outlier.js";
import { detectLongTurnDurations } from "./long-turn-durations.js";
import { detectHighContextDurationTax } from "./high-context-duration-tax.js";
import { buildDiagnostics, rankAndFormat, rankQuickWins } from "./hint-ranker.js";
import { groupEfficiencyTurns } from "./signal-extractors.js";
import type { HintsResponse, EvidenceResponse, EfficiencyRange, QuickWinResult, SessionWithEvents } from "./types.js";
import type { SessionInfo } from "../../types.js";

function loadEvents(sessions: SessionInfo[]): SessionWithEvents[] {
  return sessions.map((info) => {
    const { mainEvents } = loadFullSession(info);
    return { info, mainEvents };
  });
}

const cachedResults: Map<string, QuickWinResult[]> = new Map();

function cacheKey(range: EfficiencyRange, repo: string): string {
  return `${range}:${repo}`;
}

function findCachedResults(range: string): QuickWinResult[] | undefined {
  return cachedResults.get(cacheKey(range as EfficiencyRange, "all"))
    ?? [...cachedResults.entries()].find(([key]) => key.startsWith(`${range}:`))?.[1];
}

export function computeHints(range: EfficiencyRange, repo = "all"): HintsResponse {
  const ctx = buildDetectorContext(range, repo);
  const sessionsWithEvents = loadEvents(ctx.sessions);

  const results: QuickWinResult[] = [
    detectEditRejectionRate(sessionsWithEvents),
    detectToolFailureStorm(sessionsWithEvents),
    detectCacheHitRatio(sessionsWithEvents),
    detectCostPerLocOutlier(sessionsWithEvents),
    detectLongTurnDurations(sessionsWithEvents),
    detectHighContextDurationTax(sessionsWithEvents),
  ];

  cachedResults.set(cacheKey(range, repo), results);

  let totalCost = 0;
  let tokens = 0;
  let turns = 0;
  for (const s of sessionsWithEvents) {
    turns += groupEfficiencyTurns(s.mainEvents).length;
    for (const ev of s.mainEvents) {
      if (ev.type === "assistant") {
        tokens +=
          (ev.message.usage.input_tokens ?? 0) +
          (ev.message.usage.output_tokens ?? 0) +
          (ev.message.usage.cache_creation_input_tokens ?? 0) +
          (ev.message.usage.cache_read_input_tokens ?? 0);
        totalCost += calculateTokenCost(ev.message.model, {
          inputTokens: ev.message.usage.input_tokens,
          outputTokens: ev.message.usage.output_tokens,
          cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
        });
      }
    }
  }

  const period = {
    range,
    spend: totalCost,
    tokens,
    sessions: ctx.sessions.length,
    turns,
  };

  return {
    range,
    period,
    diagnostics: buildDiagnostics(results),
    quickWins: rankQuickWins(results),
    hints: rankAndFormat(results, range),
    sessionCount: ctx.sessions.length,
    totalCost,
  };
}

export function getEvidence(hintId: string): EvidenceResponse | undefined {
  const diagnosticSuffix = "-diagnostic";
  const isDiagnostic = hintId.endsWith(diagnosticSuffix);
  const range = isDiagnostic ? undefined : hintId.slice(hintId.lastIndexOf("-") + 1);

  const results = range ? findCachedResults(range) : undefined;
  if (!results) {
    // Try all cached ranges as fallback
    for (const [, rs] of cachedResults) {
      const result = rs.find((r) => hintId === `${r.pattern}-diagnostic` || hintId === `${r.pattern}-${range ?? ""}` || hintId.startsWith(r.pattern));
      if (result) {
        return { hintId, category: result.pattern, evidence: result.evidence };
      }
    }
    return undefined;
  }

  const result = results.find((r) => hintId === `${r.pattern}-${range}` || hintId === `${r.pattern}-diagnostic` || hintId.startsWith(r.pattern));
  if (!result) return undefined;
  return { hintId, category: result.pattern, evidence: result.evidence };
}

export function getDetectedResults(range: string): QuickWinResult[] {
  return (findCachedResults(range) ?? []).filter((r) => r.detected);
}

/** Reset cache — for testing only */
export function __resetCache(): void {
  cachedResults.clear();
}
