import type { SessionEvent, ContentItem } from "../../types.js";
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

function computeErrorRate(events: SessionEvent[]): number | undefined {
  let totalToolResults = 0;
  let errorToolResults = 0;
  for (const ev of events) {
    if (ev.type !== "user") continue;
    const content = Array.isArray(ev.message.content) ? ev.message.content : [];
    for (const item of content as ContentItem[]) {
      if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_result") {
        totalToolResults++;
        if ("is_error" in item && item.is_error === true) {
          errorToolResults++;
        }
      }
    }
  }
  if (totalToolResults === 0) return undefined;
  return errorToolResults / totalToolResults;
}

export function detectCostWaste(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalWasted = 0;

  for (const { info, mainEvents } of sessions) {
    const cost = sessionCost(mainEvents);
    if (cost < 3) continue;

    const ended = hasEndTurn(mainEvents);

    if (!ended) {
      evidenceSessions.push({
        id: info.id,
        detail: `$${cost.toFixed(2)} spent, never completed`,
        cost,
        wastedCost: cost,
      });
      totalWasted += cost;
      continue;
    }

    // Session completed, but check error rate
    const errorRate = computeErrorRate(mainEvents);
    if (errorRate !== undefined && errorRate > 0.25) {
      evidenceSessions.push({
        id: info.id,
        detail: `$${cost.toFixed(2)} spent, ${Math.round(errorRate * 100)}% tool error rate`,
        cost,
        wastedCost: cost * errorRate,
      });
      totalWasted += cost * errorRate;
    }
  }

  evidenceSessions.sort((a, b) => b.cost - a.cost);
  const detected = evidenceSessions.length > 0 && totalWasted > 2;

  const incomplete = evidenceSessions.filter((s) => s.detail.includes("never completed")).length;
  const highError = evidenceSessions.length - incomplete;
  const punchlineParts: string[] = [];
  if (incomplete > 0) punchlineParts.push(`${incomplete} never finished`);
  if (highError > 0) punchlineParts.push(`${highError} had high error rates`);

  return {
    category: "cost_waste",
    detected,
    impact: totalWasted,
    icon: "dollar-sign",
    punchline: detected
      ? `You spent $${totalWasted.toFixed(2)} on ${evidenceSessions.length} problematic sessions (${punchlineParts.join(", ")}). Check if tasks were too ambiguous or if Claude got stuck in a loop.`
      : "",
    evidence: {
      sessions: evidenceSessions.slice(0, 10),
      recommendation: "Sessions that cost money but never complete or have high error rates usually mean the prompt was too vague or the task was too large. Break big tasks into smaller, well-defined steps.",
      stats: { totalWasted, sessionsAffected: evidenceSessions.length },
    },
  };
}
