import { statSync } from "node:fs";
import type {
  SessionInfo,
  InsightsCommandsAgentsSkills,
  InsightsCommandRow,
  InsightsAgentRow,
  InsightsSkillRow,
  InsightsTimeRange,
  CasTrend,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";

const TOP_N = 10;

interface CasItemStats {
  total: number;
  tokensIn: number;
  tokensOut: number;
  days: Map<string, number>; // date (YYYY-MM-DD) → count
}

interface CasSessionCache {
  fileSize: number;
  offset: number;
  commands: Map<string, CasItemStats>;
  agents: Map<string, CasItemStats>;
  skills: Map<string, CasItemStats>;
}

const casCache = new Map<string, CasSessionCache>();

/** Exported for test isolation only — do not call in production code. */
export function resetCasForTesting(): void {
  casCache.clear();
}

function incrementItem(map: Map<string, CasItemStats>, key: string, date: string): void {
  const existing = map.get(key);
  if (!existing) {
    const days = new Map<string, number>();
    days.set(date, 1);
    map.set(key, { total: 1, tokensIn: 0, tokensOut: 0, days });
  } else {
    existing.total++;
    existing.days.set(date, (existing.days.get(date) ?? 0) + 1);
  }
}

function addTokens(map: Map<string, CasItemStats>, key: string, tokIn: number, tokOut: number): void {
  const existing = map.get(key);
  if (existing) {
    existing.tokensIn += tokIn;
    existing.tokensOut += tokOut;
  }
}

function cloneStats(stats: CasItemStats): CasItemStats {
  return { total: stats.total, tokensIn: stats.tokensIn, tokensOut: stats.tokensOut, days: new Map(stats.days) };
}

function parseCasForSession(session: SessionInfo): {
  commands: Map<string, CasItemStats>;
  agents: Map<string, CasItemStats>;
  skills: Map<string, CasItemStats>;
} {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return {
      commands: new Map(),
      agents: new Map(),
      skills: new Map(),
    };
  }

  const cached = casCache.get(session.id);
  if (cached && cached.fileSize === stat.size) {
    return { commands: cached.commands, agents: cached.agents, skills: cached.skills };
  }

  const fromOffset = cached?.offset ?? 0;
  const commands: Map<string, CasItemStats> = new Map(
    cached ? [...cached.commands.entries()].map(([k, v]) => [k, cloneStats(v)]) : []
  );
  const agents: Map<string, CasItemStats> = new Map(
    cached ? [...cached.agents.entries()].map(([k, v]) => [k, cloneStats(v)]) : []
  );
  const skills: Map<string, CasItemStats> = new Map(
    cached ? [...cached.skills.entries()].map(([k, v]) => [k, cloneStats(v)]) : []
  );

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);

    let pendingCommandKeys: string[] = [];

    for (const event of events) {
      const date =
        typeof (event as { timestamp?: unknown }).timestamp === "string"
          ? ((event as { timestamp: string }).timestamp).slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      if (event.type === "user") {
        pendingCommandKeys = [];
        const content = event.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (
            typeof block === "object" &&
            block !== null &&
            (block as { type?: unknown }).type === "text"
          ) {
            const text = ((block as { text?: unknown }).text ?? "") as string;
            if (typeof text !== "string") continue;

            // MAS command heuristic: user messages starting with "# X (MAS)\n"
            // are expanded skill invocations — extract command name from heading.
            const masMatch = text.match(/^# (.+?) \(MAS\)\n/);
            if (masMatch) {
              const slug = masMatch[1].toLowerCase().replace(/\s+/g, "-");
              const name = `/mas:${slug}`;
              incrementItem(commands, name, date);
              pendingCommandKeys.push(name);
              continue;
            }

            // Legacy raw-command detection: text starting with "/" (e.g. /compact, /model)
            if (text.startsWith("/")) {
              const name = text.split(/\s/)[0];
              incrementItem(commands, name, date);
              pendingCommandKeys.push(name);
            }
          }
        }
      }

      if (event.type === "assistant") {
        const usage = event.message.usage as typeof event.message.usage | undefined;
        const tokIn = (usage?.input_tokens ?? 0)
          + (usage?.cache_read_input_tokens ?? 0)
          + (usage?.cache_creation_input_tokens ?? 0);
        const tokOut = usage?.output_tokens ?? 0;

        // Attribute this turn's tokens to any commands dispatched in the preceding user event
        for (const cmd of pendingCommandKeys) {
          addTokens(commands, cmd, tokIn, tokOut);
        }
        pendingCommandKeys = [];

        const content = event.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (
            typeof block !== "object" ||
            block === null ||
            (block as { type?: unknown }).type !== "tool_use"
          ) {
            continue;
          }
          const toolName = (block as { name?: unknown }).name as string;
          const input = (block as { input?: unknown }).input as
            | Record<string, unknown>
            | undefined;

          if (toolName === "Agent") {
            const agentType =
              (input?.subagent_type as string | undefined) ??
              (input?.description as string | undefined) ??
              "unknown";
            incrementItem(agents, agentType, date);
            addTokens(agents, agentType, tokIn, tokOut);
          }

          if (toolName === "Skill") {
            const skillName = (input?.skill as string | undefined) ?? "unknown";
            incrementItem(skills, skillName, date);
            addTokens(skills, skillName, tokIn, tokOut);
          }
        }
      }
    }

    casCache.set(session.id, {
      fileSize: stat.size,
      offset: newOffset,
      commands,
      agents,
      skills,
    });
  } catch {
    // fail-safe: return whatever was accumulated before the error
  }

  return { commands, agents, skills };
}

function getDaysInRange(timeRange: InsightsTimeRange): string[] {
  const n =
    timeRange === "24h" ? 1
    : timeRange === "7d" ? 7
    : timeRange === "30d" ? 30
    : timeRange === "90d" ? 90
    : 365; // "all"
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function computeTrend(daily: number[]): CasTrend {
  if (daily.length < 2) return "stable";
  const half = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, half);
  const secondHalf = daily.slice(half);
  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  if (firstAvg === 0) return secondAvg > 0 ? "regressing" : "stable";
  const ratio = secondAvg / firstAvg;
  if (ratio > 1.2) return "regressing";
  if (ratio < 0.8) return "improving";
  return "stable";
}

function mergeStats(target: Map<string, CasItemStats>, source: Map<string, CasItemStats>): void {
  for (const [k, v] of source) {
    const existing = target.get(k);
    if (!existing) {
      target.set(k, cloneStats(v));
    } else {
      existing.total += v.total;
      existing.tokensIn += v.tokensIn;
      existing.tokensOut += v.tokensOut;
      for (const [d, c] of v.days) {
        existing.days.set(d, (existing.days.get(d) ?? 0) + c);
      }
    }
  }
}

function buildRankedList<T>(
  totals: Map<string, CasItemStats>,
  days: string[],
  makeRow: (name: string, count: number, share: number, daily: number[], trend: CasTrend, tokensIn: number, tokensOut: number, avgTokensIn: number, avgTokensOut: number) => T
): T[] {
  const sorted = [...totals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_N);

  const maxCount = sorted[0]?.[1].total ?? 0;
  return sorted.map(([name, stats]) => {
    const daily = days.map((d) => stats.days.get(d) ?? 0);
    const trend = computeTrend(daily);
    const avgTokensIn = stats.total > 0 ? Math.round(stats.tokensIn / stats.total) : 0;
    const avgTokensOut = stats.total > 0 ? Math.round(stats.tokensOut / stats.total) : 0;
    return makeRow(
      name,
      stats.total,
      maxCount > 0 ? stats.total / maxCount : 0,
      daily,
      trend,
      stats.tokensIn,
      stats.tokensOut,
      avgTokensIn,
      avgTokensOut,
    );
  });
}

export function computeInsightsCommandsAgentsSkills(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsCommandsAgentsSkills {
  const fromMs = getTimeRangeCutoff(timeRange);
  const days = getDaysInRange(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const totalCommands = new Map<string, CasItemStats>();
  const totalAgents = new Map<string, CasItemStats>();
  const totalSkills = new Map<string, CasItemStats>();

  for (const session of filtered) {
    const { commands, agents, skills } = parseCasForSession(session);
    mergeStats(totalCommands, commands);
    mergeStats(totalAgents, agents);
    mergeStats(totalSkills, skills);
  }

  const commandList: InsightsCommandRow[] = buildRankedList(
    totalCommands,
    days,
    (name, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut) =>
      ({ name, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut })
  );
  const agentList: InsightsAgentRow[] = buildRankedList(
    totalAgents,
    days,
    (type, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut) =>
      ({ type, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut })
  );
  const skillList: InsightsSkillRow[] = buildRankedList(
    totalSkills,
    days,
    (name, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut) =>
      ({ name, count, share, daily, trend, tokensIn, tokensOut, avgTokensIn, avgTokensOut })
  );

  return { commands: commandList, agents: agentList, skills: skillList };
}
