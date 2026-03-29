import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Mock child_process before importing routes
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

// Mock node:fs selectively
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ""),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  };
});

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
  getSessionAllowances: vi.fn(() => []),
  addSessionAllowance: vi.fn(),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));

import { discoverSessions } from "../parser/session-discovery.js";
import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";

const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as unknown as ReturnType<typeof vi.fn>;
const mockDiscoverSessions = discoverSessions as unknown as ReturnType<typeof vi.fn>;

describe("GET /settings/hooks", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns empty hooks when settings.json does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: {} });
  });

  it("returns hooks section from settings.json", async () => {
    mockExistsSync.mockReturnValue(true);
    const mockSettings = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", command: "check-allowlist.sh" },
        ],
      },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(mockSettings));

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: mockSettings.hooks });
  });

  it("returns empty hooks when settings.json has no hooks key", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ other: "data" }));

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: {} });
  });

  it("returns empty hooks when settings.json is invalid JSON", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not json{");

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: {} });
  });
});

describe("GET /sessions/:projectHash/:sessionId/memory", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns 404 when session not found", async () => {
    mockDiscoverSessions.mockReturnValue([]);

    const res = await request(app).get("/sessions/abc/def/memory");
    expect(res.status).toBe(404);
  });

  it("returns null content when CLAUDE.md does not exist", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);
    mockExistsSync.mockReturnValue(false);

    const res = await request(app).get("/sessions/proj1/sess1/memory");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: null });
  });

  it("returns CLAUDE.md content when it exists", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("# My Project\n\nSome content");

    const res = await request(app).get("/sessions/proj1/sess1/memory");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: "# My Project\n\nSome content" });
  });

  it("returns null content when session has no cwd", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1" },
    ]);

    const res = await request(app).get("/sessions/proj1/sess1/memory");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: null });
  });
});

describe("POST /sessions/:sessionId/init", () => {
  let app: express.Express;
  const mockSessionManager = {
    getStatus: vi.fn(),
    startSession: vi.fn(),
    sendMessage: vi.fn(),
    abortSession: vi.fn(),
    resumeSession: vi.fn(),
    removeSession: vi.fn(),
    getActiveSessions: vi.fn(() => []),
    resolvePermission: vi.fn(),
    setModel: vi.fn(),
    setPermissionMode: vi.fn(),
    setFastMode: vi.fn(),
    setEffortLevel: vi.fn(),
    getPendingQuestions: vi.fn(() => []),
    resolveQuestion: vi.fn(),
  };

  beforeEach(() => {
    app = express();
    app.use(
      setupRoutes({
        clients: new Set(),
        sessionManager: mockSessionManager as never,
        debugDb: undefined,
      }),
    );
    vi.clearAllMocks();
  });

  it("returns 404 when session not found", async () => {
    mockSessionManager.getStatus.mockReturnValue(null);

    const res = await request(app)
      .post("/sessions/test-session/init")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Session not found");
  });

  it("returns created: false when CLAUDE.md already exists", async () => {
    mockSessionManager.getStatus.mockReturnValue({ cwd: "/tmp/project" });
    mockExistsSync.mockReturnValue(true);

    const res = await request(app)
      .post("/sessions/test-session/init")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: false,
      message: "CLAUDE.md already exists",
    });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("creates CLAUDE.md scaffold when it does not exist", async () => {
    mockSessionManager.getStatus.mockReturnValue({ cwd: "/tmp/project" });
    mockExistsSync.mockReturnValue(false);

    const res = await request(app)
      .post("/sessions/test-session/init")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: true,
      message: "CLAUDE.md created",
    });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/project/CLAUDE.md",
      expect.stringContaining("# Project Name"),
      "utf-8",
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/project/CLAUDE.md",
      expect.stringContaining("## Build & Test"),
      "utf-8",
    );
  });
});
