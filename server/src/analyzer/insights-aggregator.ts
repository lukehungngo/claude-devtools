import { statSync } from "node:fs";
import type {
  SessionInfo,
  InsightsAggregate,
  InsightsDailyBucket,
  InsightsTimeRange,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";

interface InsightsSessionData {
  fileSize: number;
  offset: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
}

const sessionDataCache = new Map<string, InsightsSessionData>();

export function computeInsightsSessionData(session: SessionInfo): InsightsSessionData {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { fileSize: 0, offset: 0, cost: 0, tokensIn: 0, tokensOut: 0, turns: 0 };
  }

  const cached = sessionDataCache.get(session.id);
  if (cached && cached.fileSize === stat.size) return cached;

  const fromOffset = cached?.offset ?? 0;
  let cost = cached?.cost ?? 0;
  let tokensIn = cached?.tokensIn ?? 0;
  let tokensOut = cached?.tokensOut ?? 0;
  let turns = cached?.turns ?? 0;

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);
    for (const event of events) {
      if (event.type === "assistant") {
        const usage = event.message.usage;
        const model = event.message.model || "claude-sonnet-4-6";
        if (!usage) continue;
        const inTok = usage.input_tokens || 0;
        const outTok = usage.output_tokens || 0;
        tokensIn += inTok;
        tokensOut += outTok;
        cost += calculateTokenCost(model, {
          inputTokens: inTok,
          outputTokens: outTok,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
        });
      } else if (event.type === "user" && event.userType === "external") {
        turns++;
      }
    }
    const data: InsightsSessionData = {
      fileSize: stat.size,
      offset: newOffset,
      cost,
      tokensIn,
      tokensOut,
      turns,
    };
    sessionDataCache.set(session.id, data);
    return data;
  } catch {
    return { fileSize: 0, offset: 0, cost, tokensIn, tokensOut, turns };
  }
}

export function getTimeRangeCutoff(timeRange: InsightsTimeRange): number {
  const now = Date.now();
  switch (timeRange) {
    case "24h": return now - 24 * 3600_000;
    case "7d":  return now - 7 * 86400_000;
    case "30d": return now - 30 * 86400_000;
    case "90d": return now - 90 * 86400_000;
    case "all": return 0;
  }
}

export function computeInsightsAggregate(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsAggregate {
  const fromMs = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const dailyMap = new Map<string, InsightsDailyBucket>();
  const hourWeights = new Array<number>(24).fill(0);
  const activeDaySet = new Set<string>();

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;
  let totalTurns = 0;

  for (const session of filtered) {
    const data = computeInsightsSessionData(session);
    totalTokensIn += data.tokensIn;
    totalTokensOut += data.tokensOut;
    totalCost += data.cost;
    totalTurns += data.turns;

    const dt = new Date(session.startTime);
    const dateKey = dt.toISOString().slice(0, 10);
    const hour = dt.getUTCHours();

    activeDaySet.add(dateKey);
    hourWeights[hour] += data.tokensIn + data.tokensOut;

    const bucket = dailyMap.get(dateKey) ?? { date: dateKey, tokensIn: 0, tokensOut: 0, cost: 0 };
    bucket.tokensIn += data.tokensIn;
    bucket.tokensOut += data.tokensOut;
    bucket.cost += data.cost;
    dailyMap.set(dateKey, bucket);
  }

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const peakHour = hourWeights.length > 0 ? hourWeights.indexOf(Math.max(...hourWeights)) : 0;

  return {
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    cost: totalCost,
    sessions: filtered.length,
    turns: totalTurns,
    avgCostPerTurn: totalTurns > 0 ? totalCost / totalTurns : 0,
    avgTokensPerTurn: totalTurns > 0 ? (totalTokensIn + totalTokensOut) / totalTurns : 0,
    activeDays: activeDaySet.size,
    peakHour,
    daily,
  };
}
