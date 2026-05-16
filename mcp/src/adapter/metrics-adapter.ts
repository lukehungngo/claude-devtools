import type { SessionMetrics, SessionInfo, SessionEvent } from "claude-devtools-server/src/types.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { computeMetrics } from "claude-devtools-server/src/analyzer/metrics.js";
import { loadConfig } from "../config.js";
import { findSessionPath } from "../security/path-guard.js";

/**
 * Build a minimal SessionInfo for computeMetrics from a path + events.
 */
function buildSessionInfo(
  sessionId: string,
  projectHash: string,
  filePath: string,
  events: SessionEvent[],
): SessionInfo {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  return {
    id: sessionId,
    projectHash,
    path: filePath,
    startTime: firstEvent?.timestamp ?? new Date().toISOString(),
    lastModified: lastEvent?.timestamp ?? new Date().toISOString(),
    eventCount: events.length,
    subagentCount: 0,
    cwd: firstEvent?.cwd,
    gitBranch: firstEvent?.gitBranch,
    model:
      events.find((e) => e.type === "assistant")?.message?.model ?? undefined,
  };
}

/**
 * Loads and computes metrics for a single session by id.
 * Throws SESSION_NOT_FOUND if the session doesn't exist.
 */
export function loadSessionMetrics(sessionId: string): SessionMetrics {
  const cfg = loadConfig();
  const filePath = findSessionPath(cfg.projectsDir, sessionId);

  const events = parseJsonlFile(filePath);
  // For the MCP server, we don't load subagent files (they're in separate dirs).
  // computeMetrics works with main events only for the top-level metrics.
  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<string, { agentType: string; description: string }>();

  // Extract projectHash from path
  const parts = filePath.split("/");
  const projectHash = parts[parts.length - 2] ?? "unknown";

  const sessionInfo = buildSessionInfo(sessionId, projectHash, filePath, events);
  return computeMetrics(sessionInfo, events, subagentEvents, subagentMeta);
}
