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
  getSessionAllowances: vi.fn(() => []),
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
  logger: { warn: vi.fn(), error: vi.fn(), child: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "../http/routes.js";
import { SessionManager } from "./session-manager.js";

describe("POST /sessions/:sessionId/rewind", () => {
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

  it("returns 400 when userMessageId is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/rewind`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("userMessageId is required");
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/sessions/nonexistent/rewind")
      .send({ userMessageId: "msg-123" });

    expect(res.status).toBe(404);
  });

  it("returns canRewind:false when session has no activeQuery", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/rewind`)
      .send({ userMessageId: "msg-123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canRewind: false,
      error: "No active query — session must be streaming to rewind files",
    });
  });

  it("passes dryRun flag correctly", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    // Mock the activeQuery on the session
    const mockRewindFiles = vi.fn().mockResolvedValue({
      canRewind: true,
      filesChanged: ["src/App.tsx"],
      insertions: 3,
      deletions: 1,
    });
    const session = sessionManager.getStatus(sessionId)!;
    session.activeQuery = {
      rewindFiles: mockRewindFiles,
    } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

    const res = await request(app)
      .post(`/sessions/${sessionId}/rewind`)
      .send({ userMessageId: "msg-456", dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.canRewind).toBe(true);
    expect(res.body.filesChanged).toEqual(["src/App.tsx"]);
    expect(mockRewindFiles).toHaveBeenCalledWith("msg-456", { dryRun: true });
  });
});
