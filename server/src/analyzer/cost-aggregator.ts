import type { SessionInfo, CostSummary } from "../types.js";
import { parseJsonlFile } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";

interface SessionCostData {
  lastModified: string;
  cost: number;
  tokenIn: number;
  tokenOut: number;
}

const sessionCostCache = new Map<string, SessionCostData>();

function computeSessionCost(session: SessionInfo): SessionCostData {
  const cached = sessionCostCache.get(session.id);
  if (cached && cached.lastModified === session.lastModified) {
    return cached;
  }

  let totalCost = 0;
  let tokenIn = 0;
  let tokenOut = 0;

  try {
    const events = parseJsonlFile(session.path);
    for (const event of events) {
      if (event.type !== "assistant") continue;
      const usage = event.message.usage;
      const model = event.message.model || "claude-sonnet-4-6";
      if (!usage) continue;

      const inTok = usage.input_tokens || 0;
      const outTok = usage.output_tokens || 0;
      tokenIn += inTok;
      tokenOut += outTok;

      totalCost += calculateTokenCost(model, {
        inputTokens: inTok,
        outputTokens: outTok,
        cacheWriteTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
      });
    }
  } catch {
    // skip unreadable sessions
  }

  const data: SessionCostData = {
    lastModified: session.lastModified,
    cost: totalCost,
    tokenIn,
    tokenOut,
  };
  sessionCostCache.set(session.id, data);
  return data;
}

export function aggregateCosts(sessions: SessionInfo[]): CostSummary {
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;

  let cost24h = 0;
  let cost7d = 0;
  let sessionCount24h = 0;
  let sessionCount7d = 0;
  let tokenIn24h = 0;
  let tokenOut24h = 0;
  let tokenIn7d = 0;
  let tokenOut7d = 0;

  for (const session of sessions) {
    const age = now - new Date(session.lastModified).getTime();

    if (age <= ms7d) {
      const data = computeSessionCost(session);
      cost7d += data.cost;
      tokenIn7d += data.tokenIn;
      tokenOut7d += data.tokenOut;
      sessionCount7d++;

      if (age <= ms24h) {
        cost24h += data.cost;
        tokenIn24h += data.tokenIn;
        tokenOut24h += data.tokenOut;
        sessionCount24h++;
      }
    }
  }

  return {
    cost24h,
    cost7d,
    sessionCount24h,
    sessionCount7d,
    tokenIn24h,
    tokenOut24h,
    tokenIn7d,
    tokenOut7d,
  };
}
