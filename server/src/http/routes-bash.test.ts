import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const mockSpawnSync = vi.fn();

// Helper to create a mock spawn child process
function makeMockProc(stdout: string, stderr: string, exitCode: number) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  // Emit async to allow event listeners to be attached first
  setImmediate(() => {
    proc.stdout.emit("data", Buffer.from(stdout));
    proc.stderr.emit("data", Buffer.from(stderr));
    proc.emit("close", exitCode);
  });
  return proc;
}

const mockSpawn = vi.fn();

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
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
    mockSpawn.mockReset();
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("executes a bash command and returns stdout, stderr, exitCode", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    mockSpawn.mockImplementation(() => makeMockProc("file1.ts\nfile2.ts\n", "", 0));

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .send({ command: "ls" })
      .expect(200);

    expect(res.body).toEqual({
      stdout: "file1.ts\nfile2.ts\n",
      stderr: "",
      exitCode: 0,
    });

    // Verify spawn was called with bash -c
    expect(mockSpawn).toHaveBeenCalledWith(
      "bash",
      ["-c", "ls"],
      expect.objectContaining({
        cwd: "/tmp",
      })
    );
  });

  it("returns non-zero exit code for failed commands", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    mockSpawn.mockImplementation(() => makeMockProc("", "command not found", 127));

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

  // Bug 1: CSRF protection
  it("returns 403 when Origin header is a non-localhost origin", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .set("Origin", "https://evil.com")
      .send({ command: "ls" })
      .expect(403);

    expect(res.body.error).toContain("Cross-origin");
  });

  it("returns 403 when Referer header is a non-localhost origin", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .set("Referer", "https://evil.com/page")
      .send({ command: "ls" })
      .expect(403);

    expect(res.body.error).toContain("Cross-origin");
  });

  it("allows requests with no Origin and no Referer header", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    mockSpawn.mockImplementation(() => makeMockProc("ok", "", 0));

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .send({ command: "ls" })
      .expect(200);

    expect(res.body.exitCode).toBe(0);
  });

  it("allows requests with localhost Origin", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    mockSpawn.mockImplementation(() => makeMockProc("ok", "", 0));

    const res = await request(app)
      .post(`/sessions/${sessionId}/bash`)
      .set("Origin", "http://localhost:5173")
      .send({ command: "ls" })
      .expect(200);

    expect(res.body.exitCode).toBe(0);
  });
});
