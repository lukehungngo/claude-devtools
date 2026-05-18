import { asSessionArray, buildQuickWin, evidenceSession, friendlyDuration } from "./quick-win-utils.js";
import { groupEfficiencyTurns } from "./signal-extractors.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const RECOMMENDATION = "Split broad prompts into smaller turns and resolve repeated failing commands before continuing.";

export function detectLongTurnDurations(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  const turns = sessions.flatMap((session) => groupEfficiencyTurns(session.mainEvents).map((turn) => ({ ...turn, session })));
  const durations = turns.map((turn) => turn.durationMs).filter((duration): duration is number => duration !== null);
  const p95DurationMs = percentile95(durations);
  const longTurnCount = durations.filter((duration) => duration > 60_000).length;
  const totalToolCalls = turns.reduce((sum, turn) => sum + turn.toolCalls, 0);
  const detected = (p95DurationMs > 60_000 && longTurnCount >= 5) || (p95DurationMs < 20_000 && totalToolCalls >= 20);
  const status = p95DurationMs < 20_000 && totalToolCalls >= 20 ? "praise" : "warn";
  const impactValue = `slow turns reached ${friendlyDuration(p95DurationMs)} (${longTurnCount} turns over 1m)`;
  const slowSessionIds = new Set(turns.filter((turn) => (turn.durationMs ?? 0) > 60_000).map((turn) => turn.session.info.id));

  return buildQuickWin({
    pattern: "long_turn_durations",
    status,
    category: "latency",
    severity: status === "praise" ? "positive" : p95DurationMs > 120_000 ? "high" : "medium",
    confidence: durations.length >= 10 ? "high" : "medium",
    detected,
    impact: status === "praise" ? totalToolCalls : p95DurationMs / 1000 + longTurnCount * 10,
    title: status === "praise" ? "Turns are staying fast" : "Turns are taking too long",
    punchline: detected ? impactValue : "Not enough slow-turn signal to flag a latency pattern.",
    impactLabel: status === "praise" ? "Latency signal" : "Time lost",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when p95DurationMs > 60000 and longTurnCount >= 5. Praise when p95DurationMs < 20000 and totalToolCalls >= 20.",
    icon: "timer",
    evidence: {
      sessions: sessions
        .filter((session) => slowSessionIds.has(session.info.id))
        .map((session) => evidenceSession(session, "contained turns over 60s"))
        .slice(0, 10),
      recommendation: RECOMMENDATION,
      stats: {
        slowestTypicalTurnMs: p95DurationMs,
        longTurnCount,
        totalToolCalls,
        measuredTurns: durations.length,
      },
      chips: [`slow turns ${friendlyDuration(p95DurationMs)}`, `${longTurnCount} over 1m`],
    },
  });
}

function percentile95(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}
