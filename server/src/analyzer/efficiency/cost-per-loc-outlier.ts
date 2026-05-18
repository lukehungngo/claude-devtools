import { normalizeContent } from "../../lib/normalizeContent.js";
import { asSessionArray, buildQuickWin, evidenceSession, sumSessionCosts } from "./quick-win-utils.js";
import { estimateLocChanged } from "./signal-extractors.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".sh", ".zsh", ".fish", ".sql",
  ".css", ".scss", ".html", ".vue", ".svelte",
]);
const RECOMMENDATION = "For expensive investigation work, batch the findings into a focused implementation pass before spending more turns.";

export function detectCostPerLocOutlier(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  const totalCost = sumSessionCosts(sessions);
  const locChanged = sessions.reduce((sum, session) => sum + estimateSessionLoc(session), 0);
  const costPerLoc = locChanged > 0 ? totalCost / locChanged : 0;
  const detected = locChanged >= 10 && (costPerLoc > 0.5 || costPerLoc < 0.1);
  const status = costPerLoc < 0.1 ? "praise" : "warn";
  const impactValue = `estimated $${costPerLoc.toFixed(2)} per LOC changed`;
  const evidenceSessions = sessions
    .map((session) => ({ session, loc: estimateSessionLoc(session) }))
    .filter(({ loc }) => loc > 0)
    .sort((a, b) => b.loc - a.loc)
    .map(({ session, loc }) => evidenceSession(session, `estimated ${loc} LOC changed`))
    .slice(0, 10);

  return buildQuickWin({
    pattern: "cost_per_loc_outlier",
    status,
    category: "cost",
    severity: status === "praise" ? "positive" : costPerLoc > 1 ? "high" : "medium",
    confidence: "low",
    detected,
    impact: status === "praise" ? 10 / Math.max(costPerLoc, 0.01) : costPerLoc * 20,
    title: status === "praise" ? "Code changes are landing efficiently" : "Spend is high for the code changed",
    punchline: detected ? impactValue : "Not enough estimated code change to flag a cost-per-LOC pattern.",
    impactLabel: status === "praise" ? "Efficiency signal" : "Estimated cost",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when costPerLoc > 0.50 and locChanged >= 10. Praise when costPerLoc < 0.10 and locChanged >= 10.",
    icon: "code-2",
    evidence: {
      sessions: evidenceSessions,
      recommendation: RECOMMENDATION,
      stats: {
        totalCostUsd: totalCost.toFixed(2),
        locChanged,
        costPerLocUsd: costPerLoc.toFixed(2),
      },
      chips: [`estimated ${locChanged} LOC`, `$${totalCost.toFixed(2)} spend`],
    },
  });
}

function estimateSessionLoc(session: SessionWithEvents): number {
  let loc = 0;
  for (const event of session.mainEvents) {
    if (event.type !== "assistant") continue;
    for (const content of normalizeContent(event.message.content)) {
      if (content.type !== "tool_use") continue;
      if (!isCodePath(content.input.file_path ?? content.input.path)) continue;
      loc += estimateLocChanged(content.name, content.input);
    }
  }
  return loc;
}

function isCodePath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const clean = value.split("?")[0] ?? value;
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return false;
  return CODE_EXTENSIONS.has(clean.slice(dot));
}
