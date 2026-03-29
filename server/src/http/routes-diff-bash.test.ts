import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSpawnSync = vi.fn();

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
}));

vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => [
    {
      id: "sess-1",
      projectHash: "proj-1",
      cwd: "/tmp/test-repo",
      path: "/tmp/test.jsonl",
      startTime: "2026-03-29T10:00:00Z",
      lastModified: "2026-03-29T10:05:00Z",
      eventCount: 10,
      subagentCount: 0,
    },
  ]),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(),
}));
vi.mock("../analyzer/metrics.js", () => ({ computeMetrics: vi.fn() }));
vi.mock("../api/usage-client.js", () => ({ getAnthropicUsage: vi.fn() }));
vi.mock("../analyzer/cost-aggregator.js", () => ({ aggregateCosts: vi.fn() }));
vi.mock("../analyzer/agent-events.js", () => ({ getAgentEvents: vi.fn() }));
vi.mock("../hooks/permission-handler.js", () => ({
  addPermissionRequest: vi.fn(),
  resolvePermissionRequest: vi.fn(),
  getPendingPermissions: vi.fn(() => []),
  getPermissionStatus: vi.fn(),
  addSessionAllowance: vi.fn(),
  getSessionAllowances: vi.fn(() => []),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({ buildLifecycleRecords: vi.fn() }));
vi.mock("../logger.js", () => ({
  logger: { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sessionLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  permissionLog: { info: vi.fn(), warn: vi.fn() },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";
import { SessionManager } from "../session/session-manager.js";

describe("GET /sessions/:projectHash/:sessionId/git-diff (P0-05)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    mockSpawnSync.mockReset();
  });

  it("returns both stat and diff fields", async () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        error: null,
        stdout: " src/index.ts | 5 ++---\n 1 file changed\n",
      })
      .mockReturnValueOnce({
        status: 0,
        error: null,
        stdout: "diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new\n",
      });

    const res = await request(app)
      .get("/sessions/proj-1/sess-1/git-diff")
      .expect(200);

    expect(res.body).toHaveProperty("stat");
    expect(res.body).toHaveProperty("diff");
    expect(res.body.stat).toContain("src/index.ts");
    expect(res.body.diff).toContain("diff --git");
  });

  it("returns empty strings when git diff fails", async () => {
    mockSpawnSync.mockReturnValue({ status: 1, error: new Error("fail"), stdout: "" });

    const res = await request(app)
      .get("/sessions/proj-1/sess-1/git-diff")
      .expect(200);

    expect(res.body.stat).toBe("");
    expect(res.body.diff).toBe("");
  });
});

describe("POST /sessions/:sessionId/bash (P1-07)", () => {
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
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("executes a bash command and returns stdout, stderr, exitCode", async () => {
    const sessionId = await sessionManager.startSession("/tmp/test-project");

    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: Buffer.from("file1.ts\nfile2.ts\n"),
      stderr: Buffer.from(""),
    });

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .send({ command: "ls" })
      .expect(200);

    expect(res.body).toEqual({
      stdout: "file1.ts\nfile2.ts\n",
      stderr: "",
      exitCode: 0,
    });

    // Verify spawnSync was called with bash -c
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "bash",
      ["-c", "ls"],
      expect.objectContaining({
        cwd: "/tmp/test-project",
        timeout: 30000,
      })
    );
  });

  it("returns non-zero exit code for failed commands", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    mockSpawnSync.mockReturnValue({
      status: 127,
      error: null,
      stdout: Buffer.from(""),
      stderr: Buffer.from("command not found"),
    });

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .send({ command: "nonexistent" })
      .expect(200);

    expect(res.body.exitCode).toBe(127);
    expect(res.body.stderr).toContain("command not found");
  });

  it("returns 400 when command is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .send({})
      .expect(400);

    expect(res.body.error).toContain("command");
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/sessions/nonexistent/bash")
      .send({ command: "ls" })
      .expect(404);

    expect(res.body.error).toContain("Session not found");
  });
});
