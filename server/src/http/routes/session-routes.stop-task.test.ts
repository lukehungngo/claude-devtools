import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// NEW-6 — Isolated test file for POST /sessions/:sessionId/stop-task.

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

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

describe("POST /sessions/:sessionId/stop-task (NEW-6)", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../server.js").ServerState;

    app = express();
    app.use(express.json());
    app.use(setupRoutes(state));
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("forwards { taskId } to sessionManager.stopTask and returns { ok: true } on success", async () => {
    const spy = vi.spyOn(sessionManager, "stopTask").mockResolvedValue(true);

    const res = await request(app)
      .post("/sessions/live-sess/stop-task")
      .send({ taskId: "task-abc" });

    expect(spy).toHaveBeenCalledWith("live-sess", "task-abc");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 400 when taskId is missing", async () => {
    const spy = vi.spyOn(sessionManager, "stopTask");

    const res = await request(app)
      .post("/sessions/live-sess/stop-task")
      .send({});

    expect(spy).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/taskId/i);
  });
});
