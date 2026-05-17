import type { SessionEvent } from "../../types.js";
import { calculateTokenCost } from "../metrics.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function stableHash(tool: string, input: unknown): string {
  const obj = input as Record<string, unknown> | undefined;
  if (!obj || typeof obj !== "object") return `${tool}:${JSON.stringify(input)}`;
  return `${tool}:${JSON.stringify(input, Object.keys(obj).sort())}`;
}

function extractToolCalls(events: SessionEvent[]): Array<{
  hash: string;
  model: string;
  tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number };
}> {
  const calls: Array<{
    hash: string;
    model: string;
    tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number };
  }> = [];
  for (const ev of events) {
    if (ev.type !== "assistant") continue;
    const content = Array.isArray(ev.message.content) ? ev.message.content : [];
    for (const item of content) {
      if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_use") {
        const tu = item as { type: "tool_use"; name: string; input: unknown };
        calls.push({
          hash: stableHash(tu.name, tu.input),
          model: ev.message.model,
          tokens: {
            inputTokens: ev.message.usage.input_tokens,
            outputTokens: ev.message.usage.output_tokens,
            cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
          },
        });
      }
    }
  }
  return calls;
}

export function detectWastedRetries(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalWasted = 0;
  let totalRetries = 0;

  for (const { info, mainEvents } of sessions) {
    const calls = extractToolCalls(mainEvents);
    let streak = 1;
    let sessionRetries = 0;
    let sessionWasted = 0;

    for (let i = 1; i < calls.length; i++) {
      if (calls[i]!.hash === calls[i - 1]!.hash) {
        streak++;
        if (streak >= 3) {
          const cost = calculateTokenCost(calls[i]!.model, calls[i]!.tokens);
          sessionWasted += cost;
          sessionRetries++;
        }
      } else {
        streak = 1;
      }
    }

    if (sessionRetries > 0) {
      evidenceSessions.push({
        id: info.id,
        detail: `${sessionRetries} retry loops, $${sessionWasted.toFixed(2)} wasted`,
        cost: sessionWasted,
        wastedCost: sessionWasted,
      });
      totalWasted += sessionWasted;
      totalRetries += sessionRetries;
    }
  }

  const detected = evidenceSessions.length > 0;
  return {
    category: "wasted_retries",
    detected,
    impact: totalWasted,
    icon: "repeat",
    punchline: detected
      ? `You wasted $${totalWasted.toFixed(2)} on ${totalRetries} retry loops. A single Read or check command would have prevented most of them.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Before running a command you're unsure about, ask Claude to check if the file, path, or config exists first. One Read or ls prevents cascading retries.",
      stats: { totalWasted, totalRetries, sessionsAffected: evidenceSessions.length },
    },
  };
}
