import path from "node:path";
import { statSync } from "node:fs";
import type {
  SessionInfo,
  InsightsTopConsumers,
  InsightsTopRepoRow,
  InsightsTopSessionRow,
  InsightsTopToolRow,
  InsightsTimeRange,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import {
  computeInsightsSessionData,
  getTimeRangeCutoff,
} from "./insights-aggregator.js";

const TOP_N = 5;

interface ToolCountsCache {
  fileSize: number;
  offset: number;
  counts: Map<string, number>;
}

const toolCountsCache = new Map<string, ToolCountsCache>();

/** Exported for test isolation only — do not call in production code. */
export function resetCachesForTesting(): void {
  toolCountsCache.clear();
}

function computeToolCountsForSession(session: SessionInfo): Map<string, number> {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return new Map();
  }

  const cached = toolCountsCache.get(session.id);
  if (cached && cached.fileSize === stat.size) return cached.counts;

  const fromOffset = cached?.offset ?? 0;
  const counts: Map<string, number> = new Map(cached?.counts ?? []);

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);
    for (const event of events) {
      if (event.type !== "assistant") continue;
      const content = event.message.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          item.type === "tool_use" &&
          "name" in item &&
          typeof (item as { name: unknown }).name === "string"
        ) {
          const name = (item as { name: string }).name;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
    toolCountsCache.set(session.id, {
      fileSize: stat.size,
      offset: newOffset,
      counts,
    });
    return counts;
  } catch {
    return counts;
  }
}

/**
 * Converts a UTC timestamp to a local Date by shifting by tzOffset minutes.
 * tzOffset follows JS convention: getTimezoneOffset() returns minutes WEST of UTC.
 * Vietnam UTC+7 → -420. Use local.toISOString().slice(0,10) for local date.
 */
function toLocalDate(utcMs: number, tzOffset: number): Date {
  return new Date(utcMs - tzOffset * 60_000);
}

export function computeInsightsTopConsumers(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string,
  tzOffset: number = 0
): InsightsTopConsumers {
  const fromMs = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  interface RepoAccumulator {
    tokensIn: number;
    tokensOut: number;
    cost: number;
    cwd: string;
  }

  const repoTokens = new Map<string, RepoAccumulator>();
  const sessionCosts: Array<{
    sessionId: string;
    date: string;
    repo: string;
    cost: number;
  }> = [];
  const toolTotals = new Map<string, number>();

  for (const session of filtered) {
    const data = computeInsightsSessionData(session);
    const cwdKey = session.cwd ?? "unknown";
    const repoName = path.basename(cwdKey);

    const existing = repoTokens.get(cwdKey) ?? {
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      cwd: cwdKey,
    };
    repoTokens.set(cwdKey, {
      tokensIn: existing.tokensIn + data.tokensIn,
      tokensOut: existing.tokensOut + data.tokensOut,
      cost: existing.cost + data.cost,
      cwd: cwdKey,
    });

    sessionCosts.push({
      sessionId: session.id,
      date: toLocalDate(new Date(session.startTime).getTime(), tzOffset).toISOString().slice(0, 10),
      repo: repoName,
      cost: data.cost,
    });

    const toolCounts = computeToolCountsForSession(session);
    for (const [name, count] of toolCounts) {
      toolTotals.set(name, (toolTotals.get(name) ?? 0) + count);
    }
  }

  // Build top repos — sorted by totalTokens desc, share relative to #1
  const sortedRepos = [...repoTokens.entries()]
    .map(([, v]) => ({
      repo: path.basename(v.cwd),
      cwd: v.cwd,
      tokensIn: v.tokensIn,
      tokensOut: v.tokensOut,
      totalTokens: v.tokensIn + v.tokensOut,
      cost: v.cost,
      share: 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, TOP_N);

  const maxRepoTokens = sortedRepos[0]?.totalTokens ?? 0;
  const repos: InsightsTopRepoRow[] = sortedRepos.map((r) => ({
    ...r,
    share: maxRepoTokens > 0 ? r.totalTokens / maxRepoTokens : 0,
  }));

  // Build top sessions — sorted by cost desc, share relative to #1
  const sortedSessions = [...sessionCosts]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, TOP_N);

  const maxSessionCost = sortedSessions[0]?.cost ?? 0;
  const topSessions: InsightsTopSessionRow[] = sortedSessions.map((s) => ({
    ...s,
    share: maxSessionCost > 0 ? s.cost / maxSessionCost : 0,
  }));

  // Build top tools — sorted by count desc, share relative to #1
  const sortedTools = [...toolTotals.entries()]
    .map(([name, count]) => ({ name, count, share: 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  const maxToolCount = sortedTools[0]?.count ?? 0;
  const tools: InsightsTopToolRow[] = sortedTools.map((t) => ({
    ...t,
    share: maxToolCount > 0 ? t.count / maxToolCount : 0,
  }));

  return { repos, sessions: topSessions, tools };
}
