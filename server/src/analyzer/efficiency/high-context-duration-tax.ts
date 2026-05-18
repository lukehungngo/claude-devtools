import { asSessionArray, buildQuickWin, friendlyDuration } from "./quick-win-utils.js";
import { groupEfficiencyTurns } from "./signal-extractors.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const RECOMMENDATION = "Compact or split the task once useful context crosses roughly 150K tokens.";

export function detectHighContextDurationTax(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  const turns = sessions.flatMap((session) => groupEfficiencyTurns(session.mainEvents).map((turn) => ({ ...turn, sessionId: session.info.id })));
  const high = turns.filter((turn) => turn.inputTokens > 150_000 && turn.durationMs !== null);
  const low = turns.filter((turn) => turn.inputTokens < 50_000 && turn.durationMs !== null);
  const highMean = mean(high.map((turn) => turn.durationMs as number));
  const lowMean = mean(low.map((turn) => turn.durationMs as number));
  const highContextDurationRatio = lowMean > 0 ? highMean / lowMean : 0;
  const detected =
    (highContextDurationRatio > 1.8 && high.length >= 5 && low.length >= 5) ||
    (highContextDurationRatio > 0 && highContextDurationRatio < 1.2 && high.length >= 5);
  const status = highContextDurationRatio > 0 && highContextDurationRatio < 1.2 ? "praise" : "warn";
  const impactValue = `high-context turns were ${highContextDurationRatio.toFixed(1)}x slower`;
  const highSessionIds = new Set(high.map((turn) => turn.sessionId));

  return buildQuickWin({
    pattern: "high_context_duration_tax",
    status,
    category: "latency",
    severity: status === "praise" ? "positive" : highContextDurationRatio > 2.5 ? "high" : "medium",
    confidence: high.length >= 8 && low.length >= 8 ? "high" : "medium",
    detected,
    impact: status === "praise" ? high.length : highContextDurationRatio * 30 + high.length,
    title: status === "praise" ? "Large context is not slowing turns much" : "Large context is slowing turns down",
    punchline: detected ? impactValue : "Not enough high- and low-context turn evidence to flag duration tax.",
    impactLabel: status === "praise" ? "Latency signal" : "Time lost",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when highContextDurationRatio > 1.8 and highContextTurns >= 5 and lowContextTurns >= 5. Praise when highContextDurationRatio < 1.2 and highContextTurns >= 5.",
    icon: "gauge",
    evidence: {
      sessions: sessions
        .filter((session) => highSessionIds.has(session.info.id))
        .map((session) => ({
          id: session.info.id,
          detail: `large-context turns averaged ${friendlyDuration(highMean)} vs ${friendlyDuration(lowMean)} for lighter turns`,
          cost: 0,
        }))
        .slice(0, 10),
      recommendation: RECOMMENDATION,
      stats: {
        highContextDurationRatio: highContextDurationRatio.toFixed(2),
        highContextTurns: high.length,
        lowContextTurns: low.length,
        highMeanDurationMs: Math.round(highMean),
        lowMeanDurationMs: Math.round(lowMean),
      },
      chips: [`${highContextDurationRatio.toFixed(1)}x slower`, `${high.length} high-context turns`],
    },
  });
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
