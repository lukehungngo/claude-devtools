import { statSync } from "node:fs";
import type { SessionInfo, CostSummary } from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";

interface SessionCostData {
  /** File size at last computation — used for cache key (grows monotonically). */
  fileSize: number;
  /** Byte offset up to which we have already computed costs. */
  offset: number;
  cost: number;
  tokenIn: number;
  tokenOut: number;
  cacheRead: number;
  cacheWrite: number;
}

const sessionCostCache = new Map<string, SessionCostData>();

function computeSessionCost(session: SessionInfo): SessionCostData {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { fileSize: 0, offset: 0, cost: 0, tokenIn: 0, tokenOut: 0, cacheRead: 0, cacheWrite: 0 };
  }

  const cached = sessionCostCache.get(session.id);

  // Full cache hit — file has not changed
  if (cached && cached.fileSize === stat.size) {
    return cached;
  }

  // Incremental update — read only new bytes from where we left off
  const fromOffset = cached ? cached.offset : 0;
  let totalCost = cached ? cached.cost : 0;
  let tokenIn = cached ? cached.tokenIn : 0;
  let tokenOut = cached ? cached.tokenOut : 0;
  let cacheRead = cached ? cached.cacheRead : 0;
  let cacheWrite = cached ? cached.cacheWrite : 0;

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);
    for (const event of events) {
      if (event.type !== "assistant") continue;
      const usage = event.message.usage;
      const model = event.message.model || "claude-sonnet-4-6";
      if (!usage) continue;

      const bareIn = usage.input_tokens || 0;
      const outTok = usage.output_tokens || 0;
      const cr = usage.cache_read_input_tokens || 0;
      const cw = usage.cache_creation_input_tokens || 0;

      // tokenIn tracks total tokens consumed (bare + cache read + cache write)
      tokenIn += bareIn + cr + cw;
      tokenOut += outTok;
      cacheRead += cr;
      cacheWrite += cw;

      totalCost += calculateTokenCost(model, {
        inputTokens: bareIn,
        outputTokens: outTok,
        cacheWriteTokens: cw,
        cacheReadTokens: cr,
      });
    }

    const data: SessionCostData = {
      fileSize: stat.size,
      offset: newOffset,
      cost: totalCost,
      tokenIn,
      tokenOut,
      cacheRead,
      cacheWrite,
    };
    sessionCostCache.set(session.id, data);
    return data;
  } catch {
    // skip unreadable sessions
    return { fileSize: 0, offset: 0, cost: totalCost, tokenIn, tokenOut, cacheRead, cacheWrite };
  }
}

/** Exported only for test isolation — do not call in production code. */
export function _resetCostCacheForTesting(): void {
  sessionCostCache.clear();
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
  let cacheRead24h = 0;
  let cacheWrite24h = 0;
  let cacheRead7d = 0;
  let cacheWrite7d = 0;

  for (const session of sessions) {
    const age = now - new Date(session.lastModified).getTime();

    if (age <= ms7d) {
      const data = computeSessionCost(session);
      cost7d += data.cost;
      tokenIn7d += data.tokenIn;
      tokenOut7d += data.tokenOut;
      cacheRead7d += data.cacheRead;
      cacheWrite7d += data.cacheWrite;
      sessionCount7d++;

      if (age <= ms24h) {
        cost24h += data.cost;
        tokenIn24h += data.tokenIn;
        tokenOut24h += data.tokenOut;
        cacheRead24h += data.cacheRead;
        cacheWrite24h += data.cacheWrite;
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
    cacheRead24h,
    cacheWrite24h,
    cacheRead7d,
    cacheWrite7d,
  };
}
