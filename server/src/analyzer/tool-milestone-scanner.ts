import { statSync } from "node:fs";
import type { SessionInfo, InsightsToolMilestone } from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";

interface MilestoneSessionCache {
  fileSize: number;
  offset: number;
  mcpServers: Set<string>;
}

const milestoneCache = new Map<string, MilestoneSessionCache>();

/** Exported for test isolation only — do not call in production code. */
export function resetMilestoneCacheForTesting(): void {
  milestoneCache.clear();
}

function extractMcpServerName(toolName: string): string | null {
  if (!toolName.startsWith("mcp__")) return null;
  const parts = toolName.split("__");
  if (parts.length < 3) return null;
  return parts[1];
}

function computeMcpServersForSession(session: SessionInfo): Set<string> {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return new Set();
  }

  const cached = milestoneCache.get(session.id);
  if (cached && cached.fileSize === stat.size) return cached.mcpServers;

  const fromOffset = cached?.offset ?? 0;
  const mcpServers: Set<string> = new Set(cached?.mcpServers ?? []);

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
          const serverName = extractMcpServerName(name);
          if (serverName !== null) {
            mcpServers.add(serverName);
          }
        }
      }
    }
    milestoneCache.set(session.id, {
      fileSize: stat.size,
      offset: newOffset,
      mcpServers,
    });
    return mcpServers;
  } catch {
    return mcpServers;
  }
}

/**
 * Scans sessions for MCP tool usage and returns milestone records per MCP server.
 * Each record tracks the first and last session date that used a given MCP server.
 *
 * @param sessions - List of sessions to scan
 * @param repo - Optional filter: cwd path to restrict to, or "all" / undefined for no filter
 */
export function scanToolMilestones(
  sessions: SessionInfo[],
  repo?: string
): InsightsToolMilestone[] {
  const filtered =
    repo && repo !== "all"
      ? sessions.filter((s) => s.cwd === repo)
      : sessions;

  // Map: serverName → { firstSeen, lastSeen } (as YYYY-MM-DD)
  const serverDates = new Map<string, { firstSeen: string; lastSeen: string }>();

  for (const session of filtered) {
    const sessionDate = session.startTime.slice(0, 10);
    const mcpServers = computeMcpServersForSession(session);

    for (const serverName of mcpServers) {
      const existing = serverDates.get(serverName);
      if (!existing) {
        serverDates.set(serverName, {
          firstSeen: sessionDate,
          lastSeen: sessionDate,
        });
      } else {
        serverDates.set(serverName, {
          firstSeen:
            sessionDate < existing.firstSeen ? sessionDate : existing.firstSeen,
          lastSeen:
            sessionDate > existing.lastSeen ? sessionDate : existing.lastSeen,
        });
      }
    }
  }

  const nowMs = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const results: InsightsToolMilestone[] = Array.from(serverDates.entries()).map(
    ([name, { firstSeen, lastSeen }]) => {
      const lastSeenMs = new Date(lastSeen).getTime();
      const isActive = nowMs - lastSeenMs <= fourteenDaysMs;
      return { name, firstSeen, lastSeen, isActive };
    }
  );

  results.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));

  return results;
}
