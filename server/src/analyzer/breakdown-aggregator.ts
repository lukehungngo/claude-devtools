import { statSync } from "node:fs";
import { basename } from "node:path";
import type {
  SessionInfo,
  InsightsBreakdown,
  InsightsModelEntry,
  InsightsTopRepo,
  InsightsTopSession,
  InsightsTopTool,
  InsightsTimeRange,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";

interface ModelStats {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
}

// Cached per-file breakdown data — invalidated when file size or mtime changes
interface BreakdownSessionCache {
  fileSize: number;
  mtime: number;
  offset: number;
  models: Map<string, ModelStats>;
  tools: Map<string, number>;
  totalCost: number;
}

const breakdownCache = new Map<string, BreakdownSessionCache>();

function parseSessionBreakdown(session: SessionInfo): BreakdownSessionCache {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { fileSize: 0, mtime: 0, offset: 0, models: new Map(), tools: new Map(), totalCost: 0 };
  }

  const mtime = stat.mtimeMs;
  const cached = breakdownCache.get(session.path);

  // Cache hit: file unchanged
  if (cached && cached.fileSize === stat.size && cached.mtime === mtime) {
    return cached;
  }

  // Incremental: file only grew — resume from last offset, copy existing data
  const useIncremental = cached !== undefined && cached.fileSize < stat.size;
  const incrementalOffset = useIncremental ? cached.offset : 0;
  const models: Map<string, ModelStats> = useIncremental ? new Map(cached.models) : new Map();
  const tools: Map<string, number> = useIncremental ? new Map(cached.tools) : new Map();
  let totalCost = useIncremental ? cached.totalCost : 0;
  let newOffset = incrementalOffset;

  try {
    const { events, newOffset: updatedOffset } = parseJsonlIncremental(session.path, incrementalOffset);
    newOffset = updatedOffset;

    for (const event of events) {
      if (event.type !== "assistant") continue;

      const message = event.message;
      const model = message.model ?? "unknown";
      const usage = message.usage;
      if (!usage) continue;

      const inTok = usage.input_tokens ?? 0;
      const outTok = usage.output_tokens ?? 0;
      const eventCost = calculateTokenCost(model, {
        inputTokens: inTok,
        outputTokens: outTok,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      });

      const existing = models.get(model) ?? { tokensIn: 0, tokensOut: 0, cost: 0, turns: 0 };
      models.set(model, {
        tokensIn: existing.tokensIn + inTok,
        tokensOut: existing.tokensOut + outTok,
        cost: existing.cost + eventCost,
        turns: existing.turns + 1,
      });
      totalCost += eventCost;

      // Count tool_use items in message content
      const content = Array.isArray(message.content) ? message.content : [];
      for (const item of content) {
        if (
          item !== null &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type: string }).type === "tool_use" &&
          "name" in item &&
          typeof (item as { name: unknown }).name === "string"
        ) {
          const name = (item as { name: string }).name;
          tools.set(name, (tools.get(name) ?? 0) + 1);
        }
      }
    }
  } catch {
    // Fail-safe: return whatever was accumulated so far
  }

  const result: BreakdownSessionCache = { fileSize: stat.size, mtime, offset: newOffset, models, tools, totalCost };
  breakdownCache.set(session.path, result);
  return result;
}

export function computeInsightsBreakdown(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsBreakdown {
  const cutoff = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.startTime).getTime();
    if (cutoff > 0 && t < cutoff) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const aggregatedModels = new Map<string, ModelStats>();
  const repoMap = new Map<string, { tokens: number; cost: number }>();
  const sessionCosts: Array<{ id: string; label: string; cost: number }> = [];
  const toolMap = new Map<string, number>();

  for (const session of filtered) {
    const data = parseSessionBreakdown(session);

    // Aggregate models across sessions
    for (const [model, stats] of data.models) {
      const agg = aggregatedModels.get(model) ?? { tokensIn: 0, tokensOut: 0, cost: 0, turns: 0 };
      aggregatedModels.set(model, {
        tokensIn: agg.tokensIn + stats.tokensIn,
        tokensOut: agg.tokensOut + stats.tokensOut,
        cost: agg.cost + stats.cost,
        turns: agg.turns + stats.turns,
      });
    }

    // Aggregate tool calls across sessions
    for (const [name, count] of data.tools) {
      toolMap.set(name, (toolMap.get(name) ?? 0) + count);
    }

    // Aggregate by repo (cwd)
    const cwd = session.cwd ?? "unknown";
    const sessionTokens = [...data.models.values()].reduce((sum, m) => sum + m.tokensIn + m.tokensOut, 0);
    const repoExisting = repoMap.get(cwd) ?? { tokens: 0, cost: 0 };
    repoMap.set(cwd, { tokens: repoExisting.tokens + sessionTokens, cost: repoExisting.cost + data.totalCost });

    // Build session label
    const date = new Date(session.startTime).toISOString().slice(0, 10);
    const repoName = basename(cwd);
    sessionCosts.push({ id: session.id, label: `${repoName} · ${date}`, cost: data.totalCost });
  }

  // Total cost for share calculation
  const totalCost = [...aggregatedModels.values()].reduce((sum, m) => sum + m.cost, 0);

  const models: InsightsModelEntry[] = [...aggregatedModels.entries()]
    .map(([model, stats]) => ({
      model,
      tokensIn: stats.tokensIn,
      tokensOut: stats.tokensOut,
      cost: stats.cost,
      turns: stats.turns,
      share: totalCost > 0 ? (stats.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  const topRepos: InsightsTopRepo[] = [...repoMap.entries()]
    .map(([slug, stats]) => ({ slug, tokens: stats.tokens, cost: stats.cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const topSessions: InsightsTopSession[] = sessionCosts
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const topTools: InsightsTopTool[] = [...toolMap.entries()]
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  return { models, topRepos, topSessions, topTools };
}
