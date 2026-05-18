import { collectEditDecisions } from "./signal-extractors.js";
import { asSessionArray, buildQuickWin, calculateSessionCost, percent } from "./quick-win-utils.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const RECOMMENDATION = "Narrow edit scope and read the target file before proposing broad file changes.";

export function detectEditRejectionRate(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  const allEvents = sessions.flatMap((session) => session.mainEvents);
  const signals = collectEditDecisions(allEvents);
  const rejectRate = signals.totalDecisions > 0 ? signals.rejectedDecisions / signals.totalDecisions : 0;
  const detected = signals.totalDecisions >= 5 && (rejectRate > 0.2 || rejectRate < 0.05);
  const status = rejectRate < 0.05 ? "praise" : "warn";
  const impactValue = `${signals.rejectedDecisions} of ${signals.totalDecisions} proposed edits rejected`;
  const evidenceSessions = sessions
    .filter((session) => signals.rejectedSessions.has(session.info.id))
    .map((session) => ({
      id: session.info.id,
      detail: `${signals.rejectedSessions.get(session.info.id) ?? 0} edit decisions rejected`,
      cost: calculateSessionCost(session),
    }))
    .slice(0, 10);

  return buildQuickWin({
    pattern: "edit_rejection_rate",
    status,
    category: "quality",
    severity: status === "praise" ? "positive" : rejectRate > 0.35 ? "high" : "medium",
    confidence: signals.totalDecisions >= 10 ? "high" : "medium",
    detected,
    impact: signals.rejectedDecisions * 10 + rejectRate * 100,
    title: status === "praise" ? "Edits are being accepted cleanly" : "Proposed edits are being rejected",
    punchline: detected
      ? impactValue
      : "Not enough edit rejection signal to flag a coaching pattern.",
    impactLabel: status === "praise" ? "Quality signal" : "Quality risk",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when rejectRate > 0.20 and totalDecisions >= 5. Praise when rejectRate < 0.05 and totalDecisions >= 5.",
    icon: "shield-x",
    evidence: {
      sessions: evidenceSessions,
      recommendation: RECOMMENDATION,
      stats: {
        rejectedDecisions: signals.rejectedDecisions,
        totalDecisions: signals.totalDecisions,
        rejectRate: percent(rejectRate),
      },
      chips: [`${signals.rejectedDecisions}/${signals.totalDecisions} rejected`, `${percent(rejectRate)} reject rate`],
    },
  });
}
