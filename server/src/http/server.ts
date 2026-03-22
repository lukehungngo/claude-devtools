import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { setupRoutes } from "./routes.js";
import { startWatcher } from "./watcher.js";

let __dirname: string;
try {
  __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
  // Fallback for CommonJS build
  __dirname = process.cwd();
}

export interface ServerState {
  clients: Set<WebSocket>;
}

export function startHttpServer(port: number = 3142): Promise<{
  url: string;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    const state: ServerState = { clients: new Set() };

    // WebSocket connections
    wss.on("connection", (ws) => {
      state.clients.add(ws);
      ws.on("close", () => state.clients.delete(ws));
    });

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
    startWatcher(state);

    // Try preferred port, fall back to random
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === 3142) {
        // Fallback to random port
        server.listen(0, () => {
          const addr = server.address();
          const actualPort = typeof addr === "object" ? addr?.port : 0;
          const url = `http://localhost:${actualPort}`;
          resolve({ url, close: () => server.close() });
        });
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolve({ url, close: () => server.close() });
    });
  });
}

export function broadcast(state: ServerState, data: unknown): void {
  const msg = JSON.stringify(data);
  for (const client of state.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
