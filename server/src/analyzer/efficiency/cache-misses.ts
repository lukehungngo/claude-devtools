import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

export function detectCacheMisses(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalInput = 0;
  let totalCacheRead = 0;

  for (const { info, mainEvents } of sessions) {
    let sessionInput = 0;
    let sessionCacheCreation = 0;
    let sessionCacheRead = 0;

    for (const ev of mainEvents) {
      if (ev.type !== "assistant") continue;
      sessionInput += ev.message.usage.input_tokens;
      sessionCacheCreation += ev.message.usage.cache_creation_input_tokens ?? 0;
      sessionCacheRead += ev.message.usage.cache_read_input_tokens ?? 0;
    }

    const sessionTotalInput = sessionInput + sessionCacheCreation + sessionCacheRead;
    totalInput += sessionTotalInput;
    totalCacheRead += sessionCacheRead;

    const hitRate = sessionTotalInput > 0 ? sessionCacheRead / sessionTotalInput : 0;
    if (sessionTotalInput > 1000 && hitRate < 0.2) {
      evidenceSessions.push({
        id: info.id,
        detail: `${Math.round(hitRate * 100)}% cache hit rate`,
        cost: 0,
      });
    }
  }

  const overallHitRate = totalInput > 0 ? totalCacheRead / totalInput : 0;
  const detected = totalInput > 5000 && overallHitRate < 0.3;

  return {
    category: "cache_misses",
    detected,
    impact: (1 - overallHitRate) * 2,
    icon: "database",
    punchline: detected
      ? `Your sessions re-read the same context every turn. Only ${Math.round(overallHitRate * 100)}% of input tokens were cached — that's extra cost and latency on every request.`
      : "",
    evidence: {
      sessions: evidenceSessions.slice(0, 10),
      recommendation: "Keep related work in the same session. When you start a new session, Claude has to re-read your entire codebase. Longer sessions with follow-up questions get progressively cheaper because context is cached.",
      stats: { overallHitRate: Math.round(overallHitRate * 100), lowCacheSessions: evidenceSessions.length },
    },
  };
}
