import chokidar from "chokidar";
import WebSocket from "ws";
import { homedir, hostname } from "node:os";
import { join, basename } from "node:path";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";

interface AgentOptions {
  serverUrl: string;
  token: string;
  source?: string;
}

export function runCollectorAgent(options: AgentOptions): void {
  const source = options.source ?? `remote:${hostname()}`;
  const projectsDir = join(homedir(), ".claude", "projects");
  const offsets = new Map<string, number>();
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let stopped = false;

  function send(msg: unknown): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function extractSessionId(filePath: string): string {
    if (filePath.includes("/subagents/")) {
      const parts = filePath.split("/");
      const idx = parts.lastIndexOf("subagents");
      return idx > 0 ? parts[idx - 1] : basename(filePath, ".jsonl");
    }
    return basename(filePath, ".jsonl");
  }

  function connect(): void {
    if (stopped) return;
    ws = new WebSocket(options.serverUrl);

    ws.on("open", () => {
      reconnectDelay = 1000;
      ws!.send(JSON.stringify({ type: "collector-hello", token: options.token, source }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as { type: string };
      if (msg.type === "collector-ok") {
        process.stdout.write(`[collector] connected to ${options.serverUrl} as ${source}\n`);
        // On connect: announce all known sessions
        for (const filePath of offsets.keys()) {
          send({ type: "new-session", sessionId: extractSessionId(filePath), filePath, source });
        }
      }
    });

    ws.on("close", () => {
      if (stopped) return;
      process.stdout.write(`[collector] disconnected, reconnecting in ${reconnectDelay / 1000}s...\n`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    });

    ws.on("error", () => { /* close handler fires after error */ });
  }

  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("add", (filePath) => {
    const { events, newOffset } = parseJsonlIncremental(filePath, 0);
    offsets.set(filePath, newOffset);
    send({ type: "new-session", sessionId: extractSessionId(filePath), filePath, source });
    if (events.length > 0) {
      send({ type: "new-events", sessionId: extractSessionId(filePath), filePath, events, source });
    }
  });

  watcher.on("change", (filePath) => {
    const currentOffset = offsets.get(filePath) ?? 0;
    const { events, newOffset } = parseJsonlIncremental(filePath, currentOffset);
    offsets.set(filePath, newOffset);
    if (events.length > 0) {
      send({ type: "new-events", sessionId: extractSessionId(filePath), filePath, events, source });
    }
  });

  connect();

  process.on("SIGINT", () => {
    stopped = true;
    watcher.close();
    ws?.close();
    process.exit(0);
  });
}
