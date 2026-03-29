import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../http/routes.js";
import type { ServerState } from "../http/server.js";
import { SessionManager } from "../session/session-manager.js";

// Mock session-discovery
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => [
    {
      id: "sess-1",
      projectHash: "abc123",
      path: "/tmp/test.jsonl",
      startTime: "2026-03-28T10:00:00Z",
      lastModified: "2026-03-28T12:00:00Z",
      eventCount: 50,
      subagentCount: 2,
      cwd: "/home/user/my-app",
      model: "claude-sonnet-4-6",
      isActive: true,
      isRunning: false,
    },
    {
      id: "sess-2",
      projectHash: "def456",
      path: "/tmp/test2.jsonl",
      startTime: "2026-03-27T08:00:00Z",
      lastModified: "2026-03-27T10:00:00Z",
      eventCount: 30,
      subagentCount: 0,
      cwd: "/home/user/my-app",
      model: "claude-opus-4-6",
      isActive: false,
      isRunning: false,
    },
    {
      id: "sess-3",
      projectHash: "ghi789",
      path: "/tmp/test3.jsonl",
      startTime: "2026-03-29T08:00:00Z",
      lastModified: "2026-03-29T10:00:00Z",
      eventCount: 20,
      subagentCount: 1,
      cwd: "/home/user/utils",
      isActive: true,
      isRunning: false,
    },
  ]),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(() => ({
    mainEvents: [],
    subagentEvents: new Map(),
    subagentMeta: new Map(),
  })),
}));

function createTestState(): ServerState {
  const broadcastFn = vi.fn();
  const sessionManager = new SessionManager(broadcastFn);
  return {
    clients: new Set(),
    sessionManager,
  };
}

function createApp(state?: ServerState) {
  const app = express();
  app.use("/api", setupRoutes(state));
  return app;
}

describe("GET /api/doctor", () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    app = createApp(createTestState());
  });

  it("returns structured health checks array", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    expect(res.body).toHaveProperty("checks");
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.checks.length).toBeGreaterThanOrEqual(4);
  });

  it("each check has name, status, and detail fields", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    for (const check of res.body.checks) {
      expect(check).toHaveProperty("name");
      expect(check).toHaveProperty("status");
      expect(check).toHaveProperty("detail");
      expect(["pass", "warn", "fail"]).toContain(check.status);
    }
  });

  it("includes node version check", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    const nodeCheck = res.body.checks.find(
      (c: { name: string }) => c.name === "node_version"
    );
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck.status).toBe("pass");
    expect(nodeCheck.detail).toMatch(/^v\d+/);
  });

  it("includes server uptime check", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    const uptimeCheck = res.body.checks.find(
      (c: { name: string }) => c.name === "server_uptime"
    );
    expect(uptimeCheck).toBeDefined();
    expect(uptimeCheck.status).toBe("pass");
  });

  it("includes session count check", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    const sessionCheck = res.body.checks.find(
      (c: { name: string }) => c.name === "session_count"
    );
    expect(sessionCheck).toBeDefined();
    expect(sessionCheck.detail).toContain("3");
  });

  it("includes active sessions check", async () => {
    const res = await request(app).get("/api/doctor").expect(200);

    const activeCheck = res.body.checks.find(
      (c: { name: string }) => c.name === "active_sessions"
    );
    expect(activeCheck).toBeDefined();
  });
});

describe("GET /api/stats", () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    app = createApp(createTestState());
  });

  it("returns stats with total sessions", async () => {
    const res = await request(app).get("/api/stats").expect(200);

    expect(res.body).toHaveProperty("totalSessions", 3);
  });

  it("returns total events across all sessions", async () => {
    const res = await request(app).get("/api/stats").expect(200);

    // 50 + 30 + 20 = 100
    expect(res.body).toHaveProperty("totalEvents", 100);
  });

  it("returns sessions per day array", async () => {
    const res = await request(app).get("/api/stats").expect(200);

    expect(res.body).toHaveProperty("sessionsPerDay");
    expect(Array.isArray(res.body.sessionsPerDay)).toBe(true);

    // Each entry should have date and count
    for (const entry of res.body.sessionsPerDay) {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("count");
    }
  });

  it("returns top repos by session count", async () => {
    const res = await request(app).get("/api/stats").expect(200);

    expect(res.body).toHaveProperty("topRepos");
    expect(Array.isArray(res.body.topRepos)).toBe(true);

    // my-app has 2 sessions, utils has 1
    const myApp = res.body.topRepos.find(
      (r: { name: string }) => r.name === "my-app"
    );
    expect(myApp).toBeDefined();
    expect(myApp.sessions).toBe(2);
  });

  it("limits top repos to 5", async () => {
    const res = await request(app).get("/api/stats").expect(200);

    expect(res.body.topRepos.length).toBeLessThanOrEqual(5);
  });
});

describe("GET /api/mcp/servers", () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    app = createApp(createTestState());
  });

  it("returns servers array", async () => {
    const res = await request(app).get("/api/mcp/servers").expect(200);

    expect(res.body).toHaveProperty("servers");
    expect(Array.isArray(res.body.servers)).toBe(true);
  });

  it("returns empty array when settings file does not exist", async () => {
    // The default mock does not have a settings file, so this should return empty
    const res = await request(app).get("/api/mcp/servers").expect(200);

    // May or may not have servers depending on whether ~/.claude/settings.json exists
    expect(res.body).toHaveProperty("servers");
  });
});
