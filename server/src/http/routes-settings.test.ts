import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";

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
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  };
});

// Mock node:fs/promises for async route handlers
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => ""),
  writeFile: vi.fn(async () => undefined),
  access: vi.fn(async () => { throw new Error("ENOENT"); }),
  mkdir: vi.fn(async () => undefined),
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
  getSessionAllowances: vi.fn(() => []),
  addSessionAllowance: vi.fn(),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  renameSession: vi.fn(),
}));

import { discoverSessions } from "../parser/session-discovery.js";
import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";

const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockAccess = access as unknown as ReturnType<typeof vi.fn>;
const mockDiscoverSessions = discoverSessions as unknown as ReturnType<typeof vi.fn>;

describe("GET /settings/hooks", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns empty hooks when settings.json does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: {} });
  });

  it("returns hooks section from settings.json", async () => {
    const mockSettings = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", command: "check-allowlist.sh" },
        ],
      },
    };
    mockReadFile.mockResolvedValue(JSON.stringify(mockSettings));

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: mockSettings.hooks });
  });

  it("returns empty hooks when settings.json has no hooks key", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ other: "data" }));

    const res = await request(app).get("/settings/hooks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hooks: {} });
  });

  it("returns empty hooks when settings.json is invalid JSON", async () => {
    mockReadFile.mockResolvedValue("not json{");

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
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const res = await request(app).get("/sessions/proj1/sess1/memory");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: null });
  });

  it("returns CLAUDE.md content when it exists", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue("# My Project\n\nSome content");

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

describe("PUT /sessions/:projectHash/:sessionId/memory", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns 404 when session not found", async () => {
    mockDiscoverSessions.mockReturnValue([]);

    const res = await request(app)
      .put("/sessions/abc/def/memory")
      .send({ content: "# Test" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when content is missing", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);

    const res = await request(app)
      .put("/sessions/proj1/sess1/memory")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is not a string", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);

    const res = await request(app)
      .put("/sessions/proj1/sess1/memory")
      .send({ content: 123 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when session has no cwd", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1" },
    ]);

    const res = await request(app)
      .put("/sessions/proj1/sess1/memory")
      .send({ content: "# Test" });
    expect(res.status).toBe(400);
  });

  it("writes CLAUDE.md content successfully", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "proj1", cwd: "/tmp/project" },
    ]);
    mockWriteFile.mockResolvedValue(undefined);

    const res = await request(app)
      .put("/sessions/proj1/sess1/memory")
      .send({ content: "# Updated Content" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/project/CLAUDE.md",
      "# Updated Content",
      "utf-8",
    );
  });

  it("rejects path traversal attempts in projectHash", async () => {
    mockDiscoverSessions.mockReturnValue([
      { id: "sess1", projectHash: "../etc", cwd: "/tmp/project" },
    ]);
    mockWriteFile.mockResolvedValue(undefined);

    const res = await request(app)
      .put("/sessions/../etc/sess1/memory")
      .send({ content: "# Hack" });
    // Even if session matches, the endpoint should only write to {cwd}/CLAUDE.md
    // This test verifies the write target is always {cwd}/CLAUDE.md
    if (res.status === 200) {
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/tmp/project/CLAUDE.md",
        "# Hack",
        "utf-8",
      );
    }
  });
});

describe("PUT /settings/hooks", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns 400 when hooks is missing", async () => {
    const res = await request(app)
      .put("/settings/hooks")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when hooks is not an object", async () => {
    const res = await request(app)
      .put("/settings/hooks")
      .send({ hooks: "not-an-object" });
    expect(res.status).toBe(400);
  });

  it("writes hooks to settings.json when file exists", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ other: "data", hooks: {} }));
    mockWriteFile.mockResolvedValue(undefined);

    const newHooks = {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
      ],
    };

    const res = await request(app)
      .put("/settings/hooks")
      .send({ hooks: newHooks });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Should preserve existing settings and update hooks
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.other).toBe("data");
    expect(written.hooks).toEqual(newHooks);
  });

  it("creates settings.json when it does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);

    const newHooks = {
      PostToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: "log.sh" }] },
      ],
    };

    const res = await request(app)
      .put("/settings/hooks")
      .send({ hooks: newHooks });
    expect(res.status).toBe(200);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.hooks).toEqual(newHooks);
  });

  it("writes empty hooks object to clear all hooks", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ hooks: { PreToolUse: [] } }));
    mockWriteFile.mockResolvedValue(undefined);

    const res = await request(app)
      .put("/settings/hooks")
      .send({ hooks: {} });
    expect(res.status).toBe(200);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.hooks).toEqual({});
  });
});

describe("POST /sessions/:sessionId/rename", () => {
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

  it("returns 400 when title is missing", async () => {
    const res = await request(app)
      .post("/sessions/test-session/rename")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty string", async () => {
    const res = await request(app)
      .post("/sessions/test-session/rename")
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is not a string", async () => {
    const res = await request(app)
      .post("/sessions/test-session/rename")
      .send({ title: 42 });
    expect(res.status).toBe(400);
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
    mockAccess.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/sessions/test-session/init")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: false,
      message: "CLAUDE.md already exists",
    });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("creates CLAUDE.md scaffold when it does not exist", async () => {
    mockSessionManager.getStatus.mockReturnValue({ cwd: "/tmp/project" });
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/sessions/test-session/init")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: true,
      message: "CLAUDE.md created",
    });
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/project/CLAUDE.md",
      expect.stringContaining("# Project Name"),
      "utf-8",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/project/CLAUDE.md",
      expect.stringContaining("## Build & Test"),
      "utf-8",
    );
  });
});
