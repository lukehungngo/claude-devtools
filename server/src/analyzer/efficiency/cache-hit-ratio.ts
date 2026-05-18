import { calculateTokenCost } from "../metrics.js";
import { asSessionArray, buildQuickWin, evidenceSession, percent } from "./quick-win-utils.js";
import type { QuickWinResult, SessionWithEvents } from "./types.js";

const RECOMMENDATION = "Keep related follow-up work in the same session and compact only when context is no longer useful.";

export function detectCacheHitRatio(sessionsInput: SessionWithEvents[] | SessionWithEvents): QuickWinResult {
  const sessions = asSessionArray(sessionsInput);
  let inputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let estimatedSavings = 0;

  for (const session of sessions) {
    for (const event of session.mainEvents) {
      if (event.type !== "assistant") continue;
      const usage = event.message.usage;
      const input = usage.input_tokens ?? 0;
      const cacheCreation = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      inputTokens += input;
      cacheCreationTokens += cacheCreation;
      cacheReadTokens += cacheRead;

      const cacheableTokens = Math.max(0, input + cacheCreation - cacheRead);
      const inputCost = calculateTokenCost(event.message.model, {
        inputTokens: cacheableTokens,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      });
      const cacheReadCost = calculateTokenCost(event.message.model, {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: cacheableTokens,
      });
      estimatedSavings += Math.max(0, inputCost - cacheReadCost);
    }
  }

  const totalInput = inputTokens + cacheCreationTokens + cacheReadTokens;
  const cacheHitRatio = totalInput > 0 ? cacheReadTokens / totalInput : 0;
  const detected = totalInput > 50_000 && (cacheHitRatio < 0.6 || cacheHitRatio > 0.8);
  const status = cacheHitRatio > 0.8 ? "praise" : "warn";
  const impactValue = status === "praise"
    ? `${percent(cacheHitRatio)} cache reuse`
    : `estimated ~$${estimatedSavings.toFixed(2)} potential cache savings`;

  const evidenceSessions = sessions
    .map((session) => {
      let sessionInput = 0;
      let sessionCacheRead = 0;
      for (const event of session.mainEvents) {
        if (event.type !== "assistant") continue;
        const usage = event.message.usage;
        sessionInput += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        sessionCacheRead += usage.cache_read_input_tokens ?? 0;
      }
      const ratio = sessionInput > 0 ? sessionCacheRead / sessionInput : 0;
      return { session, ratio, sessionInput };
    })
    .filter(({ sessionInput }) => sessionInput > 0)
    .sort((a, b) => a.ratio - b.ratio)
    .map(({ session, ratio }) => evidenceSession(session, `${percent(ratio)} cache hit ratio`))
    .slice(0, 10);

  return buildQuickWin({
    pattern: "cache_hit_ratio",
    status,
    category: "cost",
    severity: status === "praise" ? "positive" : cacheHitRatio < 0.3 ? "high" : "medium",
    confidence: totalInput > 100_000 ? "high" : "medium",
    detected,
    impact: status === "praise" ? cacheHitRatio * 10 : estimatedSavings * 100 + (1 - cacheHitRatio) * 20,
    title: status === "praise" ? "Cache reuse is strong" : "Cache reuse is leaving money on the table",
    punchline: detected ? impactValue : "Not enough cache signal to flag a coaching pattern.",
    impactLabel: status === "praise" ? "Saved" : "Estimated cost",
    impactValue,
    recommendation: RECOMMENDATION,
    rule: "Warn when cacheHitRatio < 0.60 and inputTokens > 50K. Praise when cacheHitRatio > 0.80 and inputTokens > 50K.",
    icon: "database",
    evidence: {
      sessions: evidenceSessions,
      recommendation: RECOMMENDATION,
      stats: {
        inputTokens: totalInput,
        cacheReadTokens,
        cacheHitRatio: percent(cacheHitRatio),
        estimatedSavingsUsd: estimatedSavings.toFixed(2),
      },
      chips: [`${percent(cacheHitRatio)} cache reuse`, `${Math.round(totalInput / 1000)}K input tokens`],
    },
  });
}
