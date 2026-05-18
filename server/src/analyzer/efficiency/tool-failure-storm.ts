import { collectToolSignals } from "./signal-extractors.js";
import { asSessionArray, buildQuickWin, evidenceSession, percent } from "./quick-win-utils.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const RECOMMENDATION = "Fix the dominant failing tool pattern before retrying, especially missing paths, permissions, or invalid command arguments.";

export function detectToolFailureStorm(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  const allSignals = collectToolSignals(sessions.flatMap((session) => session.mainEvents));
  const failRate = allSignals.totalToolCalls > 0 ? allSignals.failedToolCalls / allSignals.totalToolCalls : 0;
  const detected = allSignals.totalToolCalls >= 20 && (failRate > 0.1 || failRate < 0.02);
  const status = failRate < 0.02 ? "praise" : "warn";
  const impactValue = `${allSignals.failedToolCalls} of ${allSignals.totalToolCalls} tool calls failed`;

  const evidenceSessions = sessions
    .map((session) => {
      const signals = collectToolSignals(session.mainEvents);
      return { session, signals };
    })
    .filter(({ signals }) => signals.failedToolCalls > 0)
    .sort((a, b) => b.signals.failedToolCalls - a.signals.failedToolCalls)
    .map(({ session, signals }) => evidenceSession(session, `${signals.failedToolCalls} failed tool calls`))
    .slice(0, 10);

  const dominantTool = Array.from(allSignals.failuresByTool.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  return buildQuickWin({
    pattern: "tool_failure_storm",
    status,
    category: "quality",
    severity: status === "praise" ? "positive" : failRate > 0.2 ? "high" : "medium",
    confidence: allSignals.totalToolCalls >= 40 ? "high" : "medium",
    detected,
    impact: allSignals.failedToolCalls * 6 + failRate * 100,
    title: status === "praise" ? "Tool calls are succeeding reliably" : "Tool failures are interrupting progress",
    punchline: detected ? impactValue : "Not enough tool failure signal to flag a coaching pattern.",
    impactLabel: status === "praise" ? "Quality signal" : "Quality risk",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when failRate > 0.10 and totalToolCalls >= 20. Praise when failRate < 0.02 and totalToolCalls >= 20.",
    icon: "wrench",
    evidence: {
      sessions: evidenceSessions,
      recommendation: RECOMMENDATION,
      stats: {
        failedToolCalls: allSignals.failedToolCalls,
        totalToolCalls: allSignals.totalToolCalls,
        failRate: percent(failRate),
        dominantTool,
      },
      chips: [`${allSignals.failedToolCalls}/${allSignals.totalToolCalls} failed`, `${percent(failRate)} fail rate`, dominantTool],
    },
  });
}
