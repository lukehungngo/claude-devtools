import type { PatternResult, SessionWithEvents } from "./types.js";

interface PeriodStats {
  errorRate: number;
  cacheHitRate: number;
}

function computeStats(sessions: SessionWithEvents[]): PeriodStats {
  let totalTools = 0;
  let totalErrors = 0;
  let totalInput = 0;
  let totalCacheRead = 0;

  for (const { mainEvents } of sessions) {
    for (const ev of mainEvents) {
      if (ev.type === "assistant") {
        totalInput += ev.message.usage.input_tokens;
        totalCacheRead += ev.message.usage.cache_read_input_tokens ?? 0;
      }
      if (ev.type === "user") {
        const content = Array.isArray(ev.message.content) ? ev.message.content : [];
        for (const item of content) {
          if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_result") {
            totalTools++;
            if ("is_error" in item && item.is_error) totalErrors++;
          }
        }
      }
    }
  }

  return {
    errorRate: totalTools > 0 ? totalErrors / totalTools : 0,
    cacheHitRate: totalInput > 0 ? totalCacheRead / totalInput : 0,
  };
}

export function detectImprovingTrend(
  currentSessions: SessionWithEvents[],
  priorSessions: SessionWithEvents[],
): PatternResult {
  if (priorSessions.length < 3) {
    return { category: "improving_trend", detected: false, impact: 0, icon: "trending-up", punchline: "", evidence: { sessions: [], recommendation: "", stats: {} } };
  }

  const current = computeStats(currentSessions);
  const prior = computeStats(priorSessions);

  const improvements: string[] = [];
  if (prior.errorRate > 0 && current.errorRate < prior.errorRate * 0.8) {
    improvements.push(`tool error rate dropped ${Math.round((1 - current.errorRate / prior.errorRate) * 100)}%`);
  }
  if (prior.cacheHitRate > 0 && current.cacheHitRate > prior.cacheHitRate * 1.2) {
    improvements.push(`cache hit rate improved ${Math.round((current.cacheHitRate / prior.cacheHitRate - 1) * 100)}%`);
  }

  const detected = improvements.length > 0;
  return {
    category: "improving_trend",
    detected,
    impact: 0.1,
    icon: "trending-up",
    punchline: detected
      ? `Your ${improvements.join(" and ")} vs last period. Whatever you changed, keep doing it.`
      : "",
    evidence: {
      sessions: [],
      recommendation: "You're trending in the right direction. Keep applying the patterns that are working.",
      stats: { improvements: improvements.length },
    },
  };
}
