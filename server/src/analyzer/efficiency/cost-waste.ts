import type { SessionEvent } from "../../types.js";
import { calculateTokenCost } from "../metrics.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function sessionCost(events: SessionEvent[]): number {
  let cost = 0;
  for (const ev of events) {
    if (ev.type !== "assistant") continue;
    cost += calculateTokenCost(ev.message.model, {
      inputTokens: ev.message.usage.input_tokens,
      outputTokens: ev.message.usage.output_tokens,
      cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
    });
  }
  return cost;
}

function hasEndTurn(events: SessionEvent[]): boolean {
  return events.some((ev) => ev.type === "assistant" && ev.message.stop_reason === "end_turn");
}

export function detectCostWaste(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalWasted = 0;

  for (const { info, mainEvents } of sessions) {
    const cost = sessionCost(mainEvents);
    if (cost < 1) continue;
    if (hasEndTurn(mainEvents)) continue;

    evidenceSessions.push({
      id: info.id,
      detail: `$${cost.toFixed(2)} spent, never completed`,
      cost,
      wastedCost: cost,
    });
    totalWasted += cost;
  }

  evidenceSessions.sort((a, b) => b.cost - a.cost);
  const detected = evidenceSessions.length > 0 && totalWasted > 2;

  return {
    category: "cost_waste",
    detected,
    impact: totalWasted,
    icon: "dollar-sign",
    punchline: detected
      ? `You spent $${totalWasted.toFixed(2)} on ${evidenceSessions.length} sessions that never finished. Check if the task was too ambiguous or if Claude got stuck in a loop.`
      : "",
    evidence: {
      sessions: evidenceSessions.slice(0, 10),
      recommendation: "Sessions that cost money but never complete usually mean the prompt was too vague or the task was too large. Break big tasks into smaller, well-defined steps.",
      stats: { totalWasted, sessionsAffected: evidenceSessions.length },
    },
  };
}
