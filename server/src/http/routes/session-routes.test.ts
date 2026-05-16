import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing routes
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

// Mock all heavy dependencies that routes.ts imports
vi.mock("../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(),
}));
vi.mock("../../analyzer/metrics.js", () => ({
  computeMetrics: vi.fn(),
}));
vi.mock("../../api/usage-client.js", () => ({
  getAnthropicUsage: vi.fn(),
}));
vi.mock("../../analyzer/cost-aggregator.js", () => ({
  aggregateCosts: vi.fn(),
}));
vi.mock("../../analyzer/agent-events.js", () => ({
  getAgentEvents: vi.fn(),
}));
vi.mock("../../hooks/permission-handler.js", () => ({
  addPermissionRequest: vi.fn(),
  resolvePermissionRequest: vi.fn(),
  getPendingPermissions: vi.fn(() => []),
  getPermissionStatus: vi.fn(),
  addSessionAllowance: vi.fn(),
  getSessionAllowances: vi.fn(() => []),
}));
vi.mock("../../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));
vi.mock("../../logger.js", () => ({
  sessionLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  permissionLog: { info: vi.fn(), warn: vi.fn() },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "../routes.js";
import { SessionManager } from "../../session/session-manager.js";
import { RUNNING_THRESHOLD_MS } from "../../cache/session-cache.js";

describe("CLI session isRunning heuristic", () => {
  it("marks session isRunning=true when mtime is 31 seconds ago (was false with old 30s threshold)", () => {
    // Regression test: 31s ago was falsely "ended" with the old 30s threshold.
    const ageMs = 31_000;
    const lastModified = new Date(Date.now() - ageMs).toISOString();

    const resultAgeMs = Date.now() - new Date(lastModified).getTime();
    const isRunning = resultAgeMs < RUNNING_THRESHOLD_MS;

    expect(isRunning).toBe(true);
  });

  it("marks session isRunning=true when mtime is 60 seconds ago (within 2 min threshold)", () => {
    const ageMs = 60_000;
    const lastModified = new Date(Date.now() - ageMs).toISOString();

    const resultAgeMs = Date.now() - new Date(lastModified).getTime();
    const isRunning = resultAgeMs < RUNNING_THRESHOLD_MS;

    expect(isRunning).toBe(true);
  });

  it("marks session isRunning=false when mtime is 3 minutes ago (beyond 2 min threshold)", () => {
    const ageMs = 3 * 60 * 1000;
    const lastModified = new Date(Date.now() - ageMs).toISOString();

    const resultAgeMs = Date.now() - new Date(lastModified).getTime();
    const isRunning = resultAgeMs < RUNNING_THRESHOLD_MS;

    expect(isRunning).toBe(false);
  });
});

describe("GET /sessions/:sessionId/model", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../server.js").ServerState;

    app = express();
    app.use(setupRoutes(state));
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns model from SessionManager when session is active and model is set", async () => {
    const sessionId = await sessionManager.startSession("/tmp");
    sessionManager.setModel(sessionId, "claude-sonnet-4-6");

    const res = await request(app).get(`/sessions/${sessionId}/model`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ model: "claude-sonnet-4-6" });
  });

  it("returns null when session is not tracked by SessionManager", async () => {
    const res = await request(app).get("/sessions/unknown-session-id/model");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ model: null });
  });

  it("returns null when session is tracked but no model has been set", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app).get(`/sessions/${sessionId}/model`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ model: null });
  });
});

describe("GET /sessions/:sessionId/context-usage", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../server.js").ServerState;

    app = express();
    app.use(setupRoutes(state));
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns the SDK usage payload for a live session", async () => {
    const fakeUsage = {
      totalTokens: 12345,
      maxTokens: 200000,
      percentage: 6.17,
      autoCompactThreshold: 0.92,
      isAutoCompactEnabled: true,
      categories: [],
      gridRows: [],
      model: "claude-sonnet-4-6",
      memoryFiles: [],
      mcpTools: [{ name: "search", serverName: "exa", tokens: 800 }],
      agents: [{ agentType: "general", source: "user", tokens: 400 }],
      apiUsage: null,
    };
    vi.spyOn(sessionManager, "getContextUsage").mockResolvedValue(
      fakeUsage as unknown as Awaited<ReturnType<typeof sessionManager.getContextUsage>>,
    );

    const res = await request(app).get("/sessions/live-sess/context-usage");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usage: fakeUsage });
  });

  it("returns { usage: null } with 200 when the session is not live", async () => {
    // No activeQuery → manager method resolves to null by design.
    const res = await request(app).get("/sessions/cold-sess/context-usage");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usage: null });
  });

  it("returns 500 when sessionManager.getContextUsage throws", async () => {
    vi.spyOn(sessionManager, "getContextUsage").mockRejectedValue(new Error("boom"));

    const res = await request(app).get("/sessions/any/context-usage");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/context usage/i);
  });
});
