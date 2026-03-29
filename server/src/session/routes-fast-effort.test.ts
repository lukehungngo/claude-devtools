import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing routes
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

// Mock all heavy dependencies that routes.ts imports
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(),
}));
vi.mock("../analyzer/metrics.js", () => ({
  computeMetrics: vi.fn(),
}));
vi.mock("../api/usage-client.js", () => ({
  getAnthropicUsage: vi.fn(),
}));
vi.mock("../analyzer/cost-aggregator.js", () => ({
  aggregateCosts: vi.fn(),
}));
vi.mock("../analyzer/agent-events.js", () => ({
  getAgentEvents: vi.fn(),
}));
vi.mock("../hooks/permission-handler.js", () => ({
  addPermissionRequest: vi.fn(),
  resolvePermissionRequest: vi.fn(),
  getPendingPermissions: vi.fn(() => []),
  getPermissionStatus: vi.fn(),
  addSessionAllowance: vi.fn(),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));
vi.mock("../logger.js", () => ({
  sessionLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  permissionLog: { info: vi.fn(), warn: vi.fn() },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "../http/routes.js";
import { SessionManager } from "./session-manager.js";

describe("POST /sessions/:sessionId/fast", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../http/server.js").ServerState;

    app = express();
    app.use(setupRoutes(state));
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("enables fast mode on a valid session", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/fast`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, fastMode: true });
    expect(sessionManager.getStatus(sessionId)?.fastMode).toBe(true);
  });

  it("disables fast mode on a valid session", async () => {
    const sessionId = await sessionManager.startSession("/tmp");
    sessionManager.setFastMode(sessionId, true);

    const res = await request(app)
      .post(`/sessions/${sessionId}/fast`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, fastMode: false });
    expect(sessionManager.getStatus(sessionId)?.fastMode).toBe(false);
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/sessions/nonexistent-id/fast")
      .send({ enabled: true });

    expect(res.status).toBe(404);
  });

  it("returns 400 when enabled is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/fast`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when enabled is not a boolean", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/fast`)
      .send({ enabled: "yes" });

    expect(res.status).toBe(400);
  });
});

describe("POST /sessions/:sessionId/effort", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../http/server.js").ServerState;

    app = express();
    app.use(setupRoutes(state));
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("sets effort level to low on a valid session", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/effort`)
      .send({ level: "low" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, effortLevel: "low" });
    expect(sessionManager.getStatus(sessionId)?.effortLevel).toBe("low");
  });

  it("sets effort level to medium on a valid session", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/effort`)
      .send({ level: "medium" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, effortLevel: "medium" });
  });

  it("sets effort level to high on a valid session", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/effort`)
      .send({ level: "high" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, effortLevel: "high" });
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/sessions/nonexistent-id/effort")
      .send({ level: "low" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when level is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/effort`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid level", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/effort`)
      .send({ level: "turbo" });

    expect(res.status).toBe(400);
  });
});
