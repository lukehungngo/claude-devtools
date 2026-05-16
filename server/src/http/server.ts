import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { setupRoutes } from "./routes.js";
import { startWatcher } from "./watcher.js";
import { SessionManager } from "../session/session-manager.js";
import { DebugDB } from "../debug/debug-db.js";
import { backfillDebugDb } from "../debug/backfill.js";
import type { WsBroadcastMessage } from "../types.js";
import { logger, wsLog, LOG_FILE_PATH } from "../logger.js";
import { CollectorHub } from "../collector/hub.js";
import { loadOrCreate } from "../collector/token.js";
import { startDockerInjector } from "../collector/docker-injector.js";

// Resolve module directory in both runtimes:
// - native ESM (tsx dev): __filename is undefined; use fileURLToPath(import.meta.url).
// - bundled CJS (esbuild dist/cli.cjs): __filename is defined as the bundle's
//   path; previously this branch fell through to process.cwd() which broke
//   static-serve when users launched the CLI from any dir other than dist/.
let __dirname: string;
// `typeof __filename` is a TS-safe check that returns "undefined" under ESM
// (where __filename is not a declared identifier) and "string" under the
// esbuild CJS bundle (where __filename is the bundle's runtime path).
if (typeof __filename === "string") {
  __dirname = dirname(__filename);
} else {
  try {
    __dirname = dirname(fileURLToPath(import.meta.url));
  } catch {
    __dirname = process.cwd();
  }
}

export interface ServerState {
  clients: Set<WebSocket>;
  sessionManager?: SessionManager;
  debugDb?: DebugDB;
  collectorHub?: CollectorHub;
}

export function startHttpServer(port: number = 3142): Promise<{
  url: string;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    // Debug DB: dev-only SQLite for lifecycle snapshots
    const debugDb = DebugDB.open(join(__dirname, "..", "..", "debug.sqlite")) ?? undefined;

    const state: ServerState = {
      clients: new Set(),
      sessionManager: new SessionManager((data) =>
        broadcast(state, data as WsBroadcastMessage)
      ),
      debugDb,
    };

    // Backfill debug DB with all existing sessions on first run
    if (debugDb) {
      backfillDebugDb(debugDb);
    }

    // WebSocket connections
    wss.on("connection", (ws) => {
      state.clients.add(ws);
      wsLog.info({ clientCount: state.clients.size }, "ws client connected");

      // Heartbeat: ping every 30s to detect dead connections
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 30_000);

      ws.on("close", () => {
        clearInterval(heartbeat);
        state.clients.delete(ws);
        wsLog.info({ clientCount: state.clients.size }, "ws client disconnected");
      });

      ws.on("error", (err) => {
        wsLog.warn({ err }, "ws client error");
      });

      // Application-level ping/pong for client-side latency measurement
      ws.on("message", (data: unknown) => {
        try {
          const msg = JSON.parse(String(data)) as { type: string; ts?: number };
          if (msg.type === "ping" && typeof msg.ts === "number") {
            ws.send(JSON.stringify({ type: "pong", ts: msg.ts }));
          }
        } catch { /* ignore malformed */ }
      });
    });

    // Collector hub — noServer mode, routed via upgrade handler below
    const collectorToken = loadOrCreate();
    const collectorHub = new CollectorHub({
      token: collectorToken,
      onBroadcast: (msg) => broadcast(state, msg as WsBroadcastMessage),
    });

    // Single upgrade handler routes to the correct WSS by path
    server.on("upgrade", (req, socket, head) => {
      const pathname = new URL(req.url ?? "/", "ws://localhost").pathname;
      if (pathname === "/collect") {
        collectorHub.handleUpgrade(req, socket, head);
      } else {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      }
    });
    state.collectorHub = collectorHub;

    // Docker auto-injector
    const dockerInjector = startDockerInjector(port, collectorToken);

    // API routes (pass state for WebSocket broadcasting)
    app.use("/api", setupRoutes(state));

    // Serve React SPA (built dashboard)
    const publicDir = join(__dirname, "public");
    if (existsSync(publicDir)) {
      app.use(express.static(publicDir));
      // SPA fallback
      app.get("*", (_req, res) => {
        res.sendFile(join(publicDir, "index.html"));
      });
    }

    // Start file watcher
    const watcher = startWatcher(state);

    const cleanup = () => {
      dockerInjector.stop();
      collectorHub.close();
      watcher.close();
      state.sessionManager?.dispose();
      state.debugDb?.close();
      server.close();
    };

    // Try preferred port, fall back to random
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === 3142) {
        // Fallback to random port
        server.listen(0, "0.0.0.0", () => {
          const addr = server.address();
          const actualPort = typeof addr === "object" ? addr?.port : 0;
          const url = `http://localhost:${actualPort}`;
          resolve({ url, close: cleanup });
        });
      } else {
        reject(err);
      }
    });

    server.listen(port, "0.0.0.0", () => {
      const url = `http://localhost:${port}`;
      logger.info({ url, logFile: LOG_FILE_PATH }, "server started");
      process.stdout.write(`Collector token: ${collectorToken}\n`);
      process.stdout.write(`  (run 'claude-devtools token' to see again)\n\n`);
      resolve({ url, close: cleanup });
    });
  });
}

export function broadcast(state: ServerState, data: WsBroadcastMessage): void {
  const msg = JSON.stringify(data);
  for (const client of state.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
