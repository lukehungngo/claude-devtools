import chokidar from "chokidar";
import { homedir } from "node:os";
import { join } from "node:path";
import { broadcast, type ServerState } from "./server.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";

const offsets = new Map<string, number>();

export function startWatcher(state: ServerState): void {
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
      }
    }

    broadcast(state, {
      type: "new-session",
      filePath,
    });
  });
}
