import { calculateTokenCost } from "../metrics.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function isOpus(model: string): boolean {
  return model.includes("opus");
}

export function detectModelOveruse(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalSavings = 0;

  for (const { info, mainEvents } of sessions) {
    if (info.subagentCount > 0) continue;
    if (info.eventCount > 40) continue;

    let opusCost = 0;
    let sonnetCost = 0;
    let opusEvents = 0;

    for (const ev of mainEvents) {
      if (ev.type !== "assistant" || !isOpus(ev.message.model)) continue;
      opusEvents++;
      const tokens = {
        inputTokens: ev.message.usage.input_tokens,
        outputTokens: ev.message.usage.output_tokens,
        cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
      };
      opusCost += calculateTokenCost(ev.message.model, tokens);
      sonnetCost += calculateTokenCost("claude-sonnet-4-6", tokens);
    }

    const savings = opusCost - sonnetCost;
    if (opusEvents >= 3 && savings > 0.5) {
      evidenceSessions.push({
        id: info.id,
        detail: `${opusEvents} Opus calls on a simple task, $${savings.toFixed(2)} savings if Sonnet`,
        cost: opusCost,
        wastedCost: savings,
      });
      totalSavings += savings;
    }
  }

  const detected = evidenceSessions.length > 0 && totalSavings > 1;
  return {
    category: "model_overuse",
    detected,
    impact: totalSavings,
    icon: "brain",
    punchline: detected
      ? `You used Opus for ${evidenceSessions.length} simple tasks that Sonnet handles equally well. That's $${totalSavings.toFixed(2)} you didn't need to spend.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Opus excels at complex multi-file tasks and architectural decisions. For simple edits, single-file changes, and straightforward tool calls, Sonnet is just as good at 1/5 the cost.",
      stats: { totalSavings, sessionsAffected: evidenceSessions.length },
    },
  };
}
