import { statSync } from "node:fs";
import type {
  SessionInfo,
  InsightsCommandsAgentsSkills,
  InsightsCommandRow,
  InsightsAgentRow,
  InsightsSkillRow,
  InsightsTimeRange,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";

const TOP_N = 10;

interface CasSessionCache {
  fileSize: number;
  offset: number;
  commands: Map<string, number>;
  agents: Map<string, number>;
  skills: Map<string, number>;
}

const casCache = new Map<string, CasSessionCache>();

/** Exported for test isolation only — do not call in production code. */
export function resetCasForTesting(): void {
  casCache.clear();
}

function parseCasForSession(session: SessionInfo): {
  commands: Map<string, number>;
  agents: Map<string, number>;
  skills: Map<string, number>;
} {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { commands: new Map(), agents: new Map(), skills: new Map() };
  }

  const cached = casCache.get(session.id);
  if (cached && cached.fileSize === stat.size) {
    return { commands: cached.commands, agents: cached.agents, skills: cached.skills };
  }

  const fromOffset = cached?.offset ?? 0;
  const commands: Map<string, number> = new Map(cached?.commands ?? []);
  const agents: Map<string, number> = new Map(cached?.agents ?? []);
  const skills: Map<string, number> = new Map(cached?.skills ?? []);

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);

    for (const event of events) {
      if (event.type === "user") {
        const content = event.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (
            typeof block === "object" &&
            block !== null &&
            (block as { type?: unknown }).type === "text"
          ) {
            const text = ((block as { text?: unknown }).text ?? "") as string;
            if (typeof text === "string" && text.startsWith("/")) {
              const name = text.split(/\s/)[0];
              commands.set(name, (commands.get(name) ?? 0) + 1);
            }
          }
        }
      }

      if (event.type === "assistant") {
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

          if (toolName === "Task") {
            const agentType =
              (input?.subagent_type as string | undefined) ??
              (input?.description as string | undefined) ??
              "unknown";
            agents.set(agentType, (agents.get(agentType) ?? 0) + 1);
          }

          if (toolName === "Skill") {
            const skillName = (input?.skill as string | undefined) ?? "unknown";
            skills.set(skillName, (skills.get(skillName) ?? 0) + 1);
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

function buildRankedList<T extends { count: number }>(
  totals: Map<string, number>,
  makeRow: (name: string, count: number, share: number) => T
): T[] {
  const sorted = [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  const maxCount = sorted[0]?.count ?? 0;
  return sorted.map(({ name, count }) =>
    makeRow(name, count, maxCount > 0 ? count / maxCount : 0)
  );
}

export function computeInsightsCommandsAgentsSkills(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsCommandsAgentsSkills {
  const fromMs = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const totalCommands = new Map<string, number>();
  const totalAgents = new Map<string, number>();
  const totalSkills = new Map<string, number>();

  for (const session of filtered) {
    const { commands, agents, skills } = parseCasForSession(session);
    for (const [k, v] of commands) totalCommands.set(k, (totalCommands.get(k) ?? 0) + v);
    for (const [k, v] of agents) totalAgents.set(k, (totalAgents.get(k) ?? 0) + v);
    for (const [k, v] of skills) totalSkills.set(k, (totalSkills.get(k) ?? 0) + v);
  }

  const commandList: InsightsCommandRow[] = buildRankedList(
    totalCommands,
    (name, count, share) => ({ name, count, share })
  );
  const agentList: InsightsAgentRow[] = buildRankedList(
    totalAgents,
    (type, count, share) => ({ type, count, share })
  );
  const skillList: InsightsSkillRow[] = buildRankedList(
    totalSkills,
    (name, count, share) => ({ name, count, share })
  );

  return { commands: commandList, agents: agentList, skills: skillList };
}
