import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as child_process from "child_process";

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

import { discoverSessions } from "../parser/session-discovery.js";
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
  getSessionAllowances: vi.fn(() => []),
  addSessionAllowance: vi.fn(),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));

import { getSessionAllowances, getPendingPermissions } from "../hooks/permission-handler.js";
import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";

describe("POST /open-file", () => {
  let app: express.Express;
  const mockSpawnSync = child_process.spawnSync as unknown as ReturnType<typeof vi.fn>;
  const mockExecSync = child_process.execSync as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EDITOR;
  });

  it("uses spawnSync (not execSync) for VS Code --goto", async () => {
    // spawnSync succeeds for VS Code
    mockSpawnSync.mockReturnValueOnce({ status: 0, error: null });

    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "/tmp/test.ts", line: 42 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, editor: "vscode" });
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "code",
      ["--goto", "/tmp/test.ts:42"],
      { timeout: 5000 }
    );
    // execSync should NOT be called for opening files
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("uses spawnSync (not execSync) for EDITOR fallback", async () => {
    // VS Code spawnSync fails
    mockSpawnSync.mockReturnValueOnce({ status: 1, error: new Error("not found") });
    // EDITOR spawnSync succeeds
    mockSpawnSync.mockReturnValueOnce({ status: 0, error: null });

    process.env.EDITOR = "nano";

    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "/tmp/test.ts" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, editor: "nano" });
    // Second call should be the EDITOR fallback
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "nano",
      ["/tmp/test.ts"],
      { timeout: 5000 }
    );
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("falls back to vim when EDITOR is not set", async () => {
    // VS Code spawnSync fails
    mockSpawnSync.mockReturnValueOnce({ status: 1, error: new Error("not found") });
    // vim spawnSync succeeds
    mockSpawnSync.mockReturnValueOnce({ status: 0, error: null });

    delete process.env.EDITOR;

    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "/tmp/test.ts" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, editor: "vim" });
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "vim",
      ["/tmp/test.ts"],
      { timeout: 5000 }
    );
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("rejects EDITOR with shell metacharacters", async () => {
    // VS Code fails
    mockSpawnSync.mockReturnValueOnce({ status: 1, error: new Error("not found") });

    process.env.EDITOR = "vim; rm -rf /";

    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "/tmp/test.ts" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/invalid shell metacharacters/i);
    // spawnSync should only be called once (for vscode), not for the malicious EDITOR
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("rejects filePath with path traversal", async () => {
    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "/tmp/../etc/passwd" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid file path");
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects relative file paths", async () => {
    const res = await request(app)
      .post("/open-file")
      .send({ filePath: "relative/path.ts" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid file path");
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects missing filePath", async () => {
    const res = await request(app)
      .post("/open-file")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("filePath is required");
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});

describe("GET /sessions/:projectHash/:sessionId/git-diff", () => {
  let app: express.Express;
  const mockSpawnSync = child_process.spawnSync as unknown as ReturnType<typeof vi.fn>;
  const mockDiscoverSessions = discoverSessions as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns git diff stat output for a valid session", async () => {
    mockDiscoverSessions.mockReturnValue([
      { projectHash: "abc", id: "sess1", cwd: "/tmp/myrepo" },
    ]);
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: " src/index.ts | 5 ++---\n 1 file changed\n",
    });

    const res = await request(app).get("/sessions/abc/sess1/git-diff");

    expect(res.status).toBe(200);
    expect(res.body.diff).toContain("src/index.ts");
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "git",
      ["diff", "--stat"],
      expect.objectContaining({ cwd: "/tmp/myrepo" })
    );
  });

  it("returns empty diff when session not found", async () => {
    mockDiscoverSessions.mockReturnValue([]);

    const res = await request(app).get("/sessions/abc/nosess/git-diff");

    expect(res.status).toBe(404);
  });

  it("returns empty diff when git fails", async () => {
    mockDiscoverSessions.mockReturnValue([
      { projectHash: "abc", id: "sess1", cwd: "/tmp/myrepo" },
    ]);
    mockSpawnSync.mockReturnValue({
      status: 1,
      error: new Error("not a git repo"),
      stdout: "",
    });

    const res = await request(app).get("/sessions/abc/sess1/git-diff");

    expect(res.status).toBe(200);
    expect(res.body.diff).toBe("");
  });
});

describe("GET /sessions/:sessionId/permissions-info", () => {
  let app: express.Express;
  const mockGetAllowances = getSessionAllowances as unknown as ReturnType<typeof vi.fn>;
  const mockGetPending = getPendingPermissions as unknown as ReturnType<typeof vi.fn>;
  const mockDiscoverSessions = discoverSessions as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns mode, allowances, and pending count", async () => {
    mockDiscoverSessions.mockReturnValue([
      { projectHash: "abc", id: "sess1", permissionMode: "default" },
    ]);
    mockGetAllowances.mockReturnValue(["Bash", "Write"]);
    mockGetPending.mockReturnValue([
      { id: "p1", sessionId: "sess1", status: "pending" },
    ]);

    const res = await request(app).get("/sessions/sess1/permissions-info");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mode: "default",
      allowances: ["Bash", "Write"],
      pendingCount: 1,
    });
  });

  it("returns default values when session not found in discovery", async () => {
    mockDiscoverSessions.mockReturnValue([]);
    mockGetAllowances.mockReturnValue([]);
    mockGetPending.mockReturnValue([]);

    const res = await request(app).get("/sessions/nosess/permissions-info");

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("unknown");
    expect(res.body.allowances).toEqual([]);
    expect(res.body.pendingCount).toBe(0);
  });
});
