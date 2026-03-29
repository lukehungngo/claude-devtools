import chokidar from "chokidar";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { broadcast, type ServerState } from "./server.js";
import { logger } from "../logger.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { processNewEvents } from "../debug/lifecycle-builder.js";
import type { LifecycleBuilderState } from "../debug/lifecycle-builder.js";
import type { SessionEvent, WsNewEventsMessage, WsNewSessionMessage } from "../types.js";

const offsets = new Map<string, number>();

/**
 * Build a WsNewEventsMessage with sessionId extracted from the file path.
 */
export function buildNewEventsMessage(filePath: string, events: SessionEvent[]): WsNewEventsMessage {
  return {
    type: "new-events",
    filePath,
    sessionId: extractSessionIdFromPath(filePath),
    events,
  };
}

/**
 * Build a WsNewSessionMessage with sessionId extracted from the file path.
 */
export function buildNewSessionMessage(filePath: string): WsNewSessionMessage {
  return {
    type: "new-session",
    filePath,
    sessionId: extractSessionIdFromPath(filePath),
  };
}

/**
 * Extract session ID from a JSONL file path.
 * Main session:  .../{projectHash}/{sessionId}.jsonl
 * Subagent file: .../{sessionId}/subagents/agent-{agentId}.jsonl
 */
export function extractSessionIdFromPath(filePath: string): string {
  if (filePath.includes("/subagents/")) {
    // .../{sessionId}/subagents/agent-{agentId}.jsonl
    const parts = filePath.split("/");
    const subagentsIdx = parts.lastIndexOf("subagents");
    if (subagentsIdx > 0) {
      return parts[subagentsIdx - 1];
    }
  }
  // .../{sessionId}.jsonl
  return basename(filePath, ".jsonl");
}

// Per-session lifecycle builder state for incremental processing
const builderStates = new Map<string, LifecycleBuilderState>();

function storeLifecycleData(state: ServerState, filePath: string, events: SessionEvent[]): void {
  const debugDb = state.debugDb;
  if (!debugDb || events.length === 0) return;

  try {
    const sessionId = extractSessionIdFromPath(filePath);
    const builderState = builderStates.get(sessionId) ?? null;

    const { records, state: newState } = processNewEvents(
      sessionId,
      events,
      new Map(), // subagentMeta — not available in watcher context
      builderState
    );
    builderStates.set(sessionId, newState);

    debugDb.upsertSession({ sessionId, lastUpdated: new Date().toISOString() });
    for (const turn of records.turns) {
      debugDb.upsertTurn(turn);
    }
    for (const lc of records.agentLifecycles) {
      debugDb.upsertAgentLifecycle({
        ...lc,
        parentAgentId: lc.parentAgentId ?? undefined,
        completedAt: lc.completedAt ?? undefined,
        description: lc.description ?? undefined,
      });
    }
    debugDb.insertEventBatch(
      records.lifecycleEvents.map((e) => ({
        ...e,
        turnNumber: e.turnNumber,
        agentId: e.agentId,
        eventJson: e.eventJson ?? undefined,
        timestamp: e.timestamp ?? undefined,
        toolName: e.toolName ?? undefined,
      }))
    );
  } catch (err) {
    logger.warn({ error: String(err) }, "debug-db: watcher lifecycle insert failed");
  }
}

export function startWatcher(state: ServerState): { close: () => Promise<void> } {
  const projectsDir = join(homedir(), ".claude", "projects");

  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  watcher.on("change", (filePath) => {
    const currentOffset = offsets.get(filePath) || 0;
    const { events, newOffset } = parseJsonlIncremental(
      filePath,
      currentOffset
    );
    offsets.set(filePath, newOffset);

    if (events.length > 0) {
      broadcast(state, buildNewEventsMessage(filePath, events));

      storeLifecycleData(state, filePath, events);
    }
  });

  watcher.on("add", (filePath) => {
    // For subagent files (under /subagents/), parse initial content so
    // the first batch of events isn't missed from the live WS feed.
    if (filePath.includes("/subagents/")) {
      const { events, newOffset } = parseJsonlIncremental(filePath, 0);
      offsets.set(filePath, newOffset);
      if (events.length > 0) {
        broadcast(state, buildNewEventsMessage(filePath, events));
        storeLifecycleData(state, filePath, events);
      }
    }

    broadcast(state, buildNewSessionMessage(filePath));
  });

  // Clean up map entries when files are deleted
  watcher.on("unlink", (filePath) => {
    offsets.delete(filePath);
    const sessionId = extractSessionIdFromPath(filePath);
    builderStates.delete(sessionId);
    logger.debug({ filePath }, "watcher: cleaned up maps for deleted file");
  });

  // Periodic cleanup: remove entries for files that no longer exist (every 10 minutes)
  const cleanupInterval = setInterval(() => {
    let cleaned = 0;
    for (const filePath of offsets.keys()) {
      if (!existsSync(filePath)) {
        offsets.delete(filePath);
        const sessionId = extractSessionIdFromPath(filePath);
        builderStates.delete(sessionId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned }, "watcher: periodic cleanup removed stale entries");
    }
  }, 10 * 60 * 1000);

  return {
    close: async () => {
      clearInterval(cleanupInterval);
      await watcher.close();
    },
  };
}
