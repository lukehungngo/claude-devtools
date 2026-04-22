# Connectivity — Collector Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collector agent that streams JSONL events from Docker containers and remote machines to the local devtools dashboard, with zero-config Docker auto-detection.

**Architecture:** A lightweight `claude-devtools collect` subcommand watches `~/.claude/projects/**/*.jsonl` on the remote/Docker machine and streams events via WebSocket to a new collector hub (port 3143) on the local devtools server. The hub validates a shared token, buffers events in memory, and re-broadcasts them to browser clients. Session discovery merges local + buffered collector sessions so the dashboard shows all sources in one list.

**Tech Stack:** `ws` (WebSocket, already in deps), `chokidar` (already in deps), `crypto` (Node built-in for token), `child_process.spawnSync` (Docker CLI, no new dep)

---

## File Map

### New files (server)
- `server/src/collector/token.ts` — generate, save, load auth token from `~/.claude/devtools.token`
- `server/src/collector/buffer.ts` — in-memory store for collector-sourced session events
- `server/src/collector/hub.ts` — WebSocket server on port 3143; validates token, routes events
- `server/src/collector/agent.ts` — CLI collector subcommand: chokidar watcher + WS client + reconnect
- `server/src/collector/docker-injector.ts` — Docker socket detection + auto-exec collector in containers
- `server/src/http/routes/collector-routes.ts` — `GET /api/collectors` status endpoint

### Modified files (server)
- `server/src/types.ts` — add `source?: string` to `SessionInfo`, `WsNewEventsMessage`, `WsNewSessionMessage`
- `server/src/http/server.ts` — start hub alongside existing server, print token on startup
- `server/src/http/routes.ts` — mount `createCollectorRoutes`
- `server/src/parser/session-discovery.ts` — merge `collectorBuffer.getSessions()` into `discoverSessions()`
- `server/src/http/routes/session-routes.ts` — fall back to `collectorBuffer` for non-local sessions
- `server/src/cli.ts` — route `collect` subcommand to `runCollectorAgent()`

### New files (dashboard)
- `dashboard/src/components/SourceBadge.tsx` — pill badge for local/docker/remote source
- `dashboard/src/components/SourceBadge.test.tsx`
- `dashboard/src/components/panels/CollectorsPanel.tsx` — connected collectors health list
- `dashboard/src/components/panels/CollectorsPanel.test.tsx`

### Modified files (dashboard)
- `dashboard/src/lib/types.ts` — add `source?: string` to `SessionInfo`, `WsNewEventsMessage`, `WsNewSessionMessage`
- `dashboard/src/components/RepoList.tsx` — render `<SourceBadge>` on sessions
- `dashboard/src/components/panels/SettingsPanel.tsx` — add Collectors section using `CollectorsPanel`

---

## Task 1: Add `source` to shared types

**Files:**
- Modify: `server/src/types.ts`
- Modify: `dashboard/src/lib/types.ts`

- [ ] **Step 1: Add `source` to server types**

In `server/src/types.ts`, add `source?: string` to `SessionInfo` (after `isRunning?`), `WsNewEventsMessage` (after `sessionId`), and `WsNewSessionMessage` (after `sessionId`):

```typescript
// In SessionInfo interface — after isRunning?:
source?: string; // "local" | "docker:<name>" | "remote:<host>"

// In WsNewEventsMessage — after sessionId:
source?: string;

// In WsNewSessionMessage — after sessionId:
source?: string;
```

- [ ] **Step 2: Mirror in dashboard types**

In `dashboard/src/lib/types.ts`, find `SessionInfo`, `WsNewEventsMessage`, `WsNewSessionMessage` and apply the same additions as Step 1.

- [ ] **Step 3: Type-check**

```bash
cd /path/to/worktree && npx tsc -p server/tsconfig.json --noEmit && cd dashboard && npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts dashboard/src/lib/types.ts
git commit -m "feat(collector): add source field to SessionInfo and WS message types"
```

---

## Task 2: Token management

**Files:**
- Create: `server/src/collector/token.ts`
- Create: `server/src/collector/token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/collector/token.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We'll override the token path via env for testing
process.env.DEVTOOLS_TOKEN_PATH = "";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "devtools-token-test-"));
  process.env.DEVTOOLS_TOKEN_PATH = join(tempDir, "devtools.token");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("token", () => {
  it("generates a token with dt_ prefix", async () => {
    const { generateToken } = await import("./token.js");
    const t = generateToken();
    expect(t).toMatch(/^dt_[0-9a-f]{32}$/);
  });

  it("loadOrCreate creates and persists a token when none exists", async () => {
    const { loadOrCreate } = await import("./token.js");
    const t1 = loadOrCreate();
    expect(t1).toMatch(/^dt_[0-9a-f]{32}$/);
    const raw = readFileSync(process.env.DEVTOOLS_TOKEN_PATH!, "utf-8");
    expect(raw.trim()).toBe(t1);
  });

  it("loadOrCreate returns same token on second call", async () => {
    const { loadOrCreate } = await import("./token.js");
    const t1 = loadOrCreate();
    const t2 = loadOrCreate();
    expect(t1).toBe(t2);
  });

  it("loadOrCreate reads existing token from file", async () => {
    writeFileSync(process.env.DEVTOOLS_TOKEN_PATH!, "dt_abc123def456abc123def456abc123de");
    const { loadOrCreate } = await import("./token.js");
    const t = loadOrCreate();
    expect(t).toBe("dt_abc123def456abc123def456abc123de");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C server test src/collector/token.test.ts
```
Expected: FAIL — `Cannot find module './token.js'`

- [ ] **Step 3: Implement token.ts**

Create `server/src/collector/token.ts`:

```typescript
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

function tokenPath(): string {
  return process.env.DEVTOOLS_TOKEN_PATH || join(homedir(), ".claude", "devtools.token");
}

export function generateToken(): string {
  return `dt_${randomBytes(16).toString("hex")}`;
}

export function loadOrCreate(): string {
  const path = tokenPath();
  if (existsSync(path)) {
    return readFileSync(path, "utf-8").trim();
  }
  const token = generateToken();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, token, { mode: 0o600 });
  return token;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -C server test src/collector/token.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/collector/token.ts server/src/collector/token.test.ts
git commit -m "feat(collector): add token generate/load/save"
```

---

## Task 3: Collector event buffer

**Files:**
- Create: `server/src/collector/buffer.ts`
- Create: `server/src/collector/buffer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/collector/buffer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { CollectorBuffer } from "./buffer.js";
import type { SessionEvent, SessionInfo } from "../types.js";

function makeInfo(id: string, source: string): SessionInfo {
  return {
    id,
    projectHash: "hash-" + id,
    path: "/remote/.claude/projects/hash-" + id + "/" + id + ".jsonl",
    startTime: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    eventCount: 0,
    subagentCount: 0,
    source,
  };
}

function makeEvent(sessionId: string): SessionEvent {
  return {
    type: "system",
    uuid: "uuid-1",
    timestamp: new Date().toISOString(),
    sessionId,
    subtype: "init",
  };
}

describe("CollectorBuffer", () => {
  let buf: CollectorBuffer;

  beforeEach(() => {
    buf = new CollectorBuffer();
  });

  it("starts empty", () => {
    expect(buf.getSessions()).toHaveLength(0);
  });

  it("registers a session", () => {
    const info = makeInfo("s1", "remote:dev.box");
    buf.upsertSession(info);
    expect(buf.getSessions()).toHaveLength(1);
    expect(buf.getSessions()[0].id).toBe("s1");
  });

  it("adds events to a session", () => {
    const info = makeInfo("s1", "remote:dev.box");
    buf.upsertSession(info);
    buf.addEvents("s1", [makeEvent("s1")]);
    expect(buf.getEvents("s1")).toHaveLength(1);
  });

  it("returns empty array for unknown session events", () => {
    expect(buf.getEvents("nonexistent")).toHaveLength(0);
  });

  it("removes all sessions for a source", () => {
    buf.upsertSession(makeInfo("s1", "docker:app"));
    buf.upsertSession(makeInfo("s2", "docker:app"));
    buf.upsertSession(makeInfo("s3", "remote:dev.box"));
    buf.removeSource("docker:app");
    expect(buf.getSessions()).toHaveLength(1);
    expect(buf.getSessions()[0].id).toBe("s3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C server test src/collector/buffer.test.ts
```
Expected: FAIL — `Cannot find module './buffer.js'`

- [ ] **Step 3: Implement buffer.ts**

Create `server/src/collector/buffer.ts`:

```typescript
import type { SessionInfo, SessionEvent } from "../types.js";

interface BufferedSession {
  info: SessionInfo;
  events: SessionEvent[];
}

export class CollectorBuffer {
  private sessions = new Map<string, BufferedSession>();

  upsertSession(info: SessionInfo): void {
    const existing = this.sessions.get(info.id);
    this.sessions.set(info.id, {
      info,
      events: existing?.events ?? [],
    });
  }

  addEvents(sessionId: string, events: SessionEvent[]): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.events.push(...events);
      entry.info.eventCount = entry.events.length;
      entry.info.lastModified = new Date().toISOString();
    }
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((e) => e.info);
  }

  getEvents(sessionId: string): SessionEvent[] {
    return this.sessions.get(sessionId)?.events ?? [];
  }

  removeSource(source: string): void {
    for (const [id, entry] of this.sessions) {
      if (entry.info.source === source) {
        this.sessions.delete(id);
      }
    }
  }
}

/** Singleton — shared by hub (writer) and session routes (reader). */
export const collectorBuffer = new CollectorBuffer();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -C server test src/collector/buffer.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/collector/buffer.ts server/src/collector/buffer.test.ts
git commit -m "feat(collector): add in-memory CollectorBuffer"
```

---

## Task 4: Collector hub

**Files:**
- Create: `server/src/collector/hub.ts`
- Create: `server/src/collector/hub.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/collector/hub.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import WebSocket from "ws";
import { CollectorHub } from "./hub.js";

const TEST_TOKEN = "dt_test1234test1234test1234test1234";

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => ws.once("message", (d) => resolve(JSON.parse(d.toString()))));
}

function openHub(token = TEST_TOKEN): { hub: CollectorHub; port: number; cleanup: () => Promise<void> } {
  const httpServer = createServer();
  const hub = new CollectorHub({ token, httpServer });
  return {
    hub,
    port: 0, // will be set after listen
    cleanup: () => new Promise((r) => httpServer.close(() => r())),
  };
}

describe("CollectorHub", () => {
  const servers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of servers) await cleanup();
    servers.length = 0;
  });

  it("rejects connection with wrong token", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      const hub = new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      servers.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: "wrong", source: "remote:test" }));
        });
        ws.on("close", () => resolve());
      });
    });
  });

  it("accepts connection with correct token and responds collector-ok", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      const hub = new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      servers.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: TEST_TOKEN, source: "remote:test" }));
        });
        ws.on("message", (d) => {
          const msg = JSON.parse(d.toString());
          expect(msg.type).toBe("collector-ok");
          ws.close();
          resolve();
        });
      });
    });
  });

  it("getConnectedCollectors returns registered collectors", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      const hub = new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      servers.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: TEST_TOKEN, source: "remote:test" }));
        });
        ws.on("message", () => {
          const collectors = hub.getConnectedCollectors();
          expect(collectors).toHaveLength(1);
          expect(collectors[0].source).toBe("remote:test");
          ws.close();
          resolve();
        });
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C server test src/collector/hub.test.ts
```
Expected: FAIL — `Cannot find module './hub.js'`

- [ ] **Step 3: Implement hub.ts**

Create `server/src/collector/hub.ts`:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { logger } from "../logger.js";
import { collectorBuffer } from "./buffer.js";
import type { SessionEvent, SessionInfo, WsNewEventsMessage, WsNewSessionMessage } from "../types.js";

interface CollectorRecord {
  source: string;
  ws: WebSocket;
  connectedAt: Date;
  lastSeen: Date;
  sessionCount: number;
}

type BroadcastFn = (msg: WsNewEventsMessage | WsNewSessionMessage) => void;

interface HubOptions {
  token: string;
  httpServer: Server;
  onBroadcast?: BroadcastFn;
}

export class CollectorHub {
  private collectors = new Map<WebSocket, CollectorRecord>();
  private wss: WebSocketServer;
  private token: string;
  private onBroadcast?: BroadcastFn;

  constructor({ token, httpServer, onBroadcast }: HubOptions) {
    this.token = token;
    this.onBroadcast = onBroadcast;

    this.wss = new WebSocketServer({ server: httpServer, path: "/collect" });
    this.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const authTimeout = setTimeout(() => {
      logger.warn("collector: auth timeout, closing");
      ws.close();
    }, 10_000);

    ws.once("message", (data) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(data.toString()) as { type: string; token: string; source: string };
        if (msg.type !== "collector-hello" || msg.token !== this.token) {
          logger.warn({ source: msg.source }, "collector: invalid token, closing");
          ws.close();
          return;
        }

        const record: CollectorRecord = {
          source: msg.source,
          ws,
          connectedAt: new Date(),
          lastSeen: new Date(),
          sessionCount: 0,
        };
        this.collectors.set(ws, record);
        ws.send(JSON.stringify({ type: "collector-ok" }));
        logger.info({ source: msg.source }, "collector connected");

        ws.on("message", (d) => this.handleCollectorMessage(record, d.toString()));
        ws.on("close", () => {
          logger.info({ source: record.source }, "collector disconnected");
          collectorBuffer.removeSource(record.source);
          this.collectors.delete(ws);
        });
        ws.on("error", (err) => logger.warn({ source: record.source, err }, "collector ws error"));
      } catch {
        ws.close();
      }
    });
  }

  private handleCollectorMessage(record: CollectorRecord, raw: string): void {
    record.lastSeen = new Date();
    try {
      const msg = JSON.parse(raw) as { type: string; sessionId?: string; filePath?: string; events?: SessionEvent[]; source?: string };

      if (msg.type === "new-session" && msg.sessionId) {
        const info: SessionInfo = {
          id: msg.sessionId,
          projectHash: record.source.replace(/[^a-z0-9]/gi, "-"),
          path: msg.filePath ?? "",
          startTime: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          eventCount: 0,
          subagentCount: 0,
          source: record.source,
        };
        collectorBuffer.upsertSession(info);
        record.sessionCount++;
        this.onBroadcast?.({ type: "new-session", sessionId: msg.sessionId, filePath: msg.filePath ?? "", source: record.source });
      } else if (msg.type === "new-events" && msg.sessionId && msg.events) {
        collectorBuffer.addEvents(msg.sessionId, msg.events);
        this.onBroadcast?.({ type: "new-events", sessionId: msg.sessionId, filePath: msg.filePath ?? "", events: msg.events, source: record.source });
      }
    } catch (err) {
      logger.warn({ err }, "collector: malformed message");
    }
  }

  getConnectedCollectors(): Array<{ source: string; connectedAt: Date; lastSeen: Date; sessionCount: number }> {
    return Array.from(this.collectors.values()).map(({ source, connectedAt, lastSeen, sessionCount }) => ({
      source,
      connectedAt,
      lastSeen,
      sessionCount,
    }));
  }

  close(): void {
    this.wss.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -C server test src/collector/hub.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/collector/hub.ts server/src/collector/hub.test.ts
git commit -m "feat(collector): add CollectorHub WebSocket server with token auth"
```

---

## Task 5: Wire hub into server + REST endpoint

**Files:**
- Modify: `server/src/http/server.ts`
- Modify: `server/src/types.ts` (ServerState)
- Create: `server/src/http/routes/collector-routes.ts`
- Modify: `server/src/http/routes.ts`

- [ ] **Step 1: Add hub to ServerState**

In `server/src/http/server.ts`, add these imports near the top:

```typescript
import { CollectorHub } from "../collector/hub.js";
import { loadOrCreate } from "../collector/token.js";
```

In `server/src/http/server.ts`, extend the `ServerState` interface (add `collectorHub?`):

```typescript
export interface ServerState {
  clients: Set<WebSocket>;
  sessionManager?: SessionManager;
  debugDb?: DebugDB;
  collectorHub?: CollectorHub;  // ADD THIS LINE
}
```

- [ ] **Step 2: Start hub and print token**

In `server/src/http/server.ts`, inside `startHttpServer`, after the `wss` is created and before `server.listen`, add:

```typescript
// Collector hub — separate WS path on same server
const collectorToken = loadOrCreate();
const collectorHub = new CollectorHub({
  token: collectorToken,
  httpServer: server,
  onBroadcast: (msg) => broadcast(state, msg as WsBroadcastMessage),
});
state.collectorHub = collectorHub;
```

In `server.listen` callback, update the resolved `url` log to also print the token:

```typescript
server.listen(port, "0.0.0.0", () => {
  const url = `http://localhost:${port}`;
  logger.info({ url, logFile: LOG_FILE_PATH }, "server started");
  process.stdout.write(`Collector token: ${collectorToken}\n`);
  process.stdout.write(`  (run 'claude-devtools token' to see again)\n\n`);
  resolve({ url, close: cleanup });
});
```

Also update the fallback random-port listen to `0.0.0.0` (currently `127.0.0.1`):

```typescript
server.listen(0, "0.0.0.0", () => {
```

And add hub cleanup to `cleanup`:

```typescript
const cleanup = () => {
  watcher.close();
  state.sessionManager?.dispose();
  state.debugDb?.close();
  collectorHub.close();  // ADD THIS LINE
  server.close();
};
```

- [ ] **Step 3: Create collector-routes.ts**

Create `server/src/http/routes/collector-routes.ts`:

```typescript
import { Router } from "express";
import type { RouteContext } from "./route-context.js";

export function createCollectorRoutes({ state }: RouteContext): Router {
  const router = Router();

  router.get("/collectors", (_req, res) => {
    const hub = state?.collectorHub;
    if (!hub) {
      return res.json({ collectors: [] });
    }
    const collectors = hub.getConnectedCollectors().map((c) => ({
      source: c.source,
      connectedAt: c.connectedAt.toISOString(),
      lastSeen: c.lastSeen.toISOString(),
      sessionCount: c.sessionCount,
      status: "connected",
    }));
    res.json({ collectors });
  });

  return router;
}
```

- [ ] **Step 4: Mount collector routes**

In `server/src/http/routes.ts`, add the import and mount:

```typescript
import { createCollectorRoutes } from "./routes/collector-routes.js";
// ... inside setupRoutes:
router.use(createCollectorRoutes(context));
```

- [ ] **Step 5: Type-check**

```bash
npx tsc -p server/tsconfig.json --noEmit
```
Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add server/src/http/server.ts server/src/http/routes.ts server/src/http/routes/collector-routes.ts
git commit -m "feat(collector): wire hub into server, add /api/collectors endpoint"
```

---

## Task 6: Merge collector sessions into REST API

**Files:**
- Modify: `server/src/parser/session-discovery.ts`
- Modify: `server/src/http/routes/session-routes.ts`

- [ ] **Step 1: Update discoverSessions to merge collector sessions**

In `server/src/parser/session-discovery.ts`, add the import at the top:

```typescript
import { collectorBuffer } from "../collector/buffer.js";
```

In `discoverSessions()`, before the `return discoveryCache = ...` line, merge collector sessions:

```typescript
// Merge collector-sourced sessions
const collectorSessions = collectorBuffer.getSessions();
for (const cs of collectorSessions) {
  if (!sessions.find((s) => s.id === cs.id)) {
    sessions.push(cs);
  }
}
```

- [ ] **Step 2: Update session detail route to fall back to collectorBuffer**

In `server/src/http/routes/session-routes.ts`, add the import at the top:

```typescript
import { collectorBuffer } from "../../collector/buffer.js";
```

In the `router.get("/sessions/:projectHash/:sessionId", ...)` handler, after the `if (!session)` block finds the session, update the `loadFullSession` call to check the collector buffer first:

Find the block that does `loadFullSession(session)` and wrap it:

```typescript
// Check collector buffer first for remote sessions
const collectorEvents = collectorBuffer.getEvents(sessionId);
if (collectorEvents.length > 0) {
  const metrics = computeMetrics(session, collectorEvents, new Map(), new Map());
  metricsCache.set(`${projectHash}/${sessionId}`, metrics);
  return res.json({ metrics, events: collectorEvents });
}

// Fall back to local JSONL
const { mainEvents, subagentEvents, subagentMeta } = loadFullSession(session);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc -p server/tsconfig.json --noEmit
```
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/src/parser/session-discovery.ts server/src/http/routes/session-routes.ts
git commit -m "feat(collector): merge collector sessions into discovery and session detail"
```

---

## Task 7: Collector agent CLI subcommand

**Files:**
- Create: `server/src/collector/agent.ts`
- Modify: `server/src/cli.ts`

- [ ] **Step 1: Implement collector agent**

Create `server/src/collector/agent.ts`:

```typescript
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

  function extractSessionId(filePath: string): string {
    if (filePath.includes("/subagents/")) {
      const parts = filePath.split("/");
      const idx = parts.lastIndexOf("subagents");
      return idx > 0 ? parts[idx - 1] : basename(filePath, ".jsonl");
    }
    return basename(filePath, ".jsonl");
  }

  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("add", (filePath) => {
    // Read initial content on discovery
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
```

- [ ] **Step 2: Wire collect subcommand into CLI**

In `server/src/cli.ts`, add argument parsing for the `collect` subcommand:

```typescript
import { startHttpServer } from "./http/server.js";
import { runCollectorAgent } from "./collector/agent.js";
import open from "open";
import updateNotifier from "update-notifier";
import { createRequire } from "module";
import { loadOrCreate } from "./collector/token.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { name: string; version: string };
updateNotifier({ pkg }).notify();

const [, , subcommand, ...args] = process.argv;

if (subcommand === "collect") {
  // Parse --server and --token flags
  let serverUrl = "";
  let token = "";
  let source: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--server" && args[i + 1]) serverUrl = args[++i];
    else if (args[i] === "--token" && args[i + 1]) token = args[++i];
    else if (args[i] === "--source" && args[i + 1]) source = args[++i];
  }
  if (!serverUrl || !token) {
    process.stderr.write("Usage: claude-devtools collect --server ws://<host>:3143 --token <token>\n");
    process.exit(1);
  }
  runCollectorAgent({ serverUrl, token, source });
} else if (subcommand === "token") {
  const token = loadOrCreate();
  process.stdout.write(`${token}\n`);
} else {
  // Default: start dashboard server
  const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);
  process.stdout.write("Starting Claude DevTools...\n");
  const { url, close } = await startHttpServer(port);
  process.stdout.write(`\nClaude DevTools → ${url}\n\n`);
  open(url).catch(() => { process.stdout.write(`Open ${url} in your browser\n`); });
  process.on("SIGINT", () => { close(); process.exit(0); });
  process.on("SIGTERM", () => { close(); process.exit(0); });
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc -p server/tsconfig.json --noEmit
```
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/src/collector/agent.ts server/src/cli.ts
git commit -m "feat(collector): add collect CLI subcommand with chokidar + WS client"
```

---

## Task 8: Docker auto-injector

**Files:**
- Create: `server/src/collector/docker-injector.ts`
- Modify: `server/src/http/server.ts`

- [ ] **Step 1: Implement docker-injector.ts**

Create `server/src/collector/docker-injector.ts`:

```typescript
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { logger } from "../logger.js";

const INJECT_INTERVAL_MS = 60_000;
const injected = new Set<string>(); // container IDs already injected

function dockerAvailable(): boolean {
  return existsSync("/var/run/docker.sock");
}

function listRunningContainers(): Array<{ id: string; name: string }> {
  const result = spawnSync("docker", ["ps", "--format", "{{.ID}}\t{{.Names}}"], { encoding: "utf-8" });
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split("\t");
      return { id: id.trim(), name: name.trim() };
    });
}

function hasClaudeProjects(containerId: string): boolean {
  // Try both root and current-user home
  const result = spawnSync(
    "docker",
    ["exec", containerId, "sh", "-c", "test -d /root/.claude/projects || test -d ~/.claude/projects"],
    { encoding: "utf-8", timeout: 5000 }
  );
  return result.status === 0;
}

function injectCollector(containerId: string, containerName: string, serverUrl: string, token: string): void {
  logger.info({ containerId, containerName }, "docker-injector: injecting collector");
  spawnSync(
    "docker",
    [
      "exec", "-d", containerId,
      "sh", "-c",
      `npx --yes @lukehungngo/claude-devtools collect --server ${serverUrl} --token ${token} --source docker:${containerName}`,
    ],
    { encoding: "utf-8" }
  );
}

export function startDockerInjector(serverPort: number, token: string): { stop: () => void } {
  if (!dockerAvailable()) {
    logger.debug("docker-injector: Docker socket not found, skipping");
    return { stop: () => {} };
  }

  const collectorUrl = `ws://host.docker.internal:${serverPort}/collect`;

  function scan(): void {
    const containers = listRunningContainers();
    for (const { id, name } of containers) {
      if (injected.has(id)) continue;
      if (hasClaudeProjects(id)) {
        injected.add(id);
        injectCollector(id, name, collectorUrl, token);
      }
    }
    // Remove IDs that are no longer running
    const runningIds = new Set(containers.map((c) => c.id));
    for (const id of injected) {
      if (!runningIds.has(id)) injected.delete(id);
    }
  }

  scan(); // immediate first scan
  const interval = setInterval(scan, INJECT_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval),
  };
}
```

- [ ] **Step 2: Wire into server.ts**

In `server/src/http/server.ts`, add the import:

```typescript
import { startDockerInjector } from "../collector/docker-injector.js";
```

After starting the collector hub, add:

```typescript
const dockerInjector = startDockerInjector(port, collectorToken);
```

Add to `cleanup`:

```typescript
dockerInjector.stop();
```

- [ ] **Step 3: Type-check**

```bash
npx tsc -p server/tsconfig.json --noEmit
```
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/src/collector/docker-injector.ts server/src/http/server.ts
git commit -m "feat(collector): add Docker auto-injector with socket detection"
```

---

## Task 9: Dashboard — SourceBadge component

**Files:**
- Create: `dashboard/src/components/SourceBadge.tsx`
- Create: `dashboard/src/components/SourceBadge.test.tsx`
- Modify: `dashboard/src/components/RepoList.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/SourceBadge.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceBadge } from "./SourceBadge";

describe("SourceBadge", () => {
  it("renders nothing for local source", () => {
    const { container } = render(<SourceBadge source="local" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when source is undefined", () => {
    const { container } = render(<SourceBadge source={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders docker badge", () => {
    render(<SourceBadge source="docker:my-app" />);
    expect(screen.getByText("docker:my-app")).toBeDefined();
  });

  it("renders remote badge", () => {
    render(<SourceBadge source="remote:dev.box" />);
    expect(screen.getByText("remote:dev.box")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C dashboard test src/components/SourceBadge.test.tsx
```
Expected: FAIL — `Cannot find module './SourceBadge'`

- [ ] **Step 3: Implement SourceBadge.tsx**

Create `dashboard/src/components/SourceBadge.tsx`:

```typescript
interface SourceBadgeProps {
  source?: string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  if (!source || source === "local") return null;

  const isDocker = source.startsWith("docker:");
  const colorClass = isDocker
    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : "bg-purple-500/15 text-purple-400 border-purple-500/30";

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${colorClass} leading-none`}>
      {source}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -C dashboard test src/components/SourceBadge.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 5: Wire SourceBadge into RepoList**

In `dashboard/src/components/RepoList.tsx`, add the import:

```typescript
import { SourceBadge } from "./SourceBadge";
```

Find where each session row renders its name/title (search for `s.sessionName` or `s.id` in the session row JSX). Add `<SourceBadge source={s.source} />` next to the session name, e.g.:

```typescript
<span className="truncate">{sessionNames[s.id] || s.sessionName || s.id.slice(0, 8)}</span>
<SourceBadge source={s.source} />
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/SourceBadge.tsx dashboard/src/components/SourceBadge.test.tsx dashboard/src/components/RepoList.tsx
git commit -m "feat(collector): add SourceBadge component and wire into RepoList"
```

---

## Task 10: Dashboard — CollectorsPanel + SettingsPanel

**Files:**
- Create: `dashboard/src/components/panels/CollectorsPanel.tsx`
- Create: `dashboard/src/components/panels/CollectorsPanel.test.tsx`
- Modify: `dashboard/src/components/panels/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/panels/CollectorsPanel.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectorsPanel } from "./CollectorsPanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ collectors: [] }),
  });
});

describe("CollectorsPanel", () => {
  it("shows empty state when no collectors", async () => {
    render(<CollectorsPanel />);
    // Wait for fetch
    await screen.findByText(/no collectors/i);
  });

  it("shows collector source when connected", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        collectors: [
          { source: "docker:my-app", connectedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), sessionCount: 2, status: "connected" },
        ],
      }),
    });
    render(<CollectorsPanel />);
    await screen.findByText("docker:my-app");
    expect(screen.getByText("2 sessions")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C dashboard test src/components/panels/CollectorsPanel.test.tsx
```
Expected: FAIL — `Cannot find module './CollectorsPanel'`

- [ ] **Step 3: Implement CollectorsPanel.tsx**

Create `dashboard/src/components/panels/CollectorsPanel.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

interface CollectorStatus {
  source: string;
  connectedAt: string;
  lastSeen: string;
  sessionCount: number;
  status: "connected" | "disconnected";
}

export function CollectorsPanel() {
  const [collectors, setCollectors] = useState<CollectorStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collectors")
      .then((r) => r.json())
      .then((data: { collectors: CollectorStatus[] }) => {
        setCollectors(data.collectors);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch("/api/collectors")
        .then((r) => r.json())
        .then((data: { collectors: CollectorStatus[] }) => setCollectors(data.collectors))
        .catch(() => {});
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="px-4 py-3 text-dt-text2 text-sm">Loading...</div>;
  }

  if (collectors.length === 0) {
    return (
      <div className="px-4 py-3 text-dt-text2 text-sm">
        No collectors connected.
        <p className="mt-1 text-xs text-dt-text2/70">
          Run <code className="font-mono text-dt-text1">claude-devtools collect --server ws://&lt;this-ip&gt;:3143 --token &lt;token&gt;</code> on a remote machine.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {collectors.map((c) => (
        <div key={c.source} className="flex items-center justify-between px-4 py-2 hover:bg-dt-bg3/30 rounded-dt-xs mx-1">
          <div className="flex items-center gap-2">
            {c.status === "connected"
              ? <Wifi className="w-3.5 h-3.5 text-green-400" />
              : <WifiOff className="w-3.5 h-3.5 text-dt-text2" />
            }
            <span className="font-mono text-sm text-dt-text0">{c.source}</span>
          </div>
          <span className="text-xs text-dt-text2">{c.sessionCount} sessions</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -C dashboard test src/components/panels/CollectorsPanel.test.tsx
```
Expected: PASS (2 tests)

- [ ] **Step 5: Wire CollectorsPanel into SettingsPanel**

In `dashboard/src/components/panels/SettingsPanel.tsx`, add the import:

```typescript
import { CollectorsPanel } from "./CollectorsPanel";
```

Find the last `<SectionHeader>` in the return JSX and add after it:

```typescript
<SectionHeader title="Collectors" />
<CollectorsPanel />
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/panels/CollectorsPanel.tsx dashboard/src/components/panels/CollectorsPanel.test.tsx dashboard/src/components/panels/SettingsPanel.tsx
git commit -m "feat(collector): add CollectorsPanel and wire into SettingsPanel"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run all server tests**

```bash
pnpm -C server test
```
Expected: all pass, no regressions

- [ ] **Step 2: Run all dashboard tests**

```bash
pnpm -C dashboard test
```
Expected: all pass, no regressions

- [ ] **Step 3: Type-check both**

```bash
npx tsc -p server/tsconfig.json --noEmit && cd dashboard && npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 4: Build**

```bash
# From repo root (or however the build is run):
pnpm -C server build 2>/dev/null || npx -C server esbuild src/cli.ts --bundle --platform=node --outfile=../../dist/cli.cjs
```

- [ ] **Step 5: Smoke-test collector subcommand**

```bash
node dist/cli.cjs token
```
Expected: prints `dt_<32 hex chars>`

```bash
node dist/cli.cjs collect --server ws://localhost:9999 --token dt_invalid
```
Expected: `[collector] disconnected, reconnecting...` (tries to connect, fails gracefully)

- [ ] **Step 6: Tag and commit**

```bash
git add -A
git commit -m "feat(collector): connectivity MVP complete — token, hub, agent, docker, dashboard"
```
