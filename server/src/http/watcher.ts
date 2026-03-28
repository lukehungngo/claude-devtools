import chokidar from "chokidar";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { broadcast, type ServerState } from "./server.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { processNewEvents } from "../debug/lifecycle-builder.js";
import type { LifecycleBuilderState } from "../debug/lifecycle-builder.js";
import type { SessionEvent } from "../types.js";

const offsets = new Map<string, number>();

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
    console.warn("[debug-db] Watcher lifecycle insert failed:", err);
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
      broadcast(state, {
        type: "new-events",
        filePath,
        events,
      });

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
        broadcast(state, { type: "new-events", filePath, events });
        storeLifecycleData(state, filePath, events);
      }
    }

    broadcast(state, {
      type: "new-session",
      filePath,
    });
  });

  return {
    close: () => watcher.close(),
  };
}
