import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

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

import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";

const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as unknown as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as unknown as ReturnType<typeof vi.fn>;

describe("GET /settings/permissions", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns empty arrays when settings.json does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app).get("/settings/permissions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allow: [], deny: [], ask: [] });
  });

  it("returns permissions from settings.json", async () => {
    mockExistsSync.mockReturnValue(true);
    const mockSettings = {
      permissions: {
        allow: ["Read(*)", "Bash(npm test)"],
        deny: ["Write(/etc/**)"],
        ask: ["Edit(/src/**)"],
      },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(mockSettings));

    const res = await request(app).get("/settings/permissions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      allow: ["Read(*)", "Bash(npm test)"],
      deny: ["Write(/etc/**)"],
      ask: ["Edit(/src/**)"],
    });
  });

  it("returns empty arrays when no permissions key in settings", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ other: "data" }));

    const res = await request(app).get("/settings/permissions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allow: [], deny: [], ask: [] });
  });

  it("returns empty arrays when settings.json is invalid JSON", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("bad json{");

    const res = await request(app).get("/settings/permissions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allow: [], deny: [], ask: [] });
  });
});

describe("PUT /settings/permissions", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("writes permissions to settings.json", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ model: "opus" }));

    const res = await request(app)
      .put("/settings/permissions")
      .send({ allow: ["Read(*)"], deny: [], ask: ["Edit(/src/**)" ] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);

    // Verify the written JSON merges with existing
    const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(writtenData.model).toBe("opus");
    expect(writtenData.permissions).toEqual({
      allow: ["Read(*)"],
      deny: [],
      ask: ["Edit(/src/**)"],
    });
  });

  it("creates settings.json if it does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app)
      .put("/settings/permissions")
      .send({ allow: ["Bash(npm test)"], deny: [], ask: [] });

    expect(res.status).toBe(200);
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(writtenData.permissions).toEqual({
      allow: ["Bash(npm test)"],
      deny: [],
      ask: [],
    });
  });

  it("rejects invalid rule format", async () => {
    const res = await request(app)
      .put("/settings/permissions")
      .send({ allow: ["not a valid rule"], deny: [], ask: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid rule");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("rejects when body is missing required arrays", async () => {
    const res = await request(app)
      .put("/settings/permissions")
      .send({ allow: ["Read(*)"] });

    expect(res.status).toBe(400);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("GET /settings", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("returns empty settings when file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("returns full settings from settings.json", async () => {
    mockExistsSync.mockReturnValue(true);
    const mockSettings = {
      model: "claude-opus-4-6",
      permissions: { allow: [], deny: [], ask: [] },
      env: { API_KEY: "abc" },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(mockSettings));

    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body.model).toBe("claude-opus-4-6");
    expect(res.body.permissions).toEqual({ allow: [], deny: [], ask: [] });
  });

  it("returns empty object for invalid JSON", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("broken{");

    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe("PUT /settings", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(setupRoutes());
    vi.clearAllMocks();
  });

  it("updates safe fields only", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ hooks: { PreToolUse: [] } }));

    const res = await request(app)
      .put("/settings")
      .send({ model: "claude-sonnet-4-6", env: { FOO: "bar" } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(writtenData.model).toBe("claude-sonnet-4-6");
    expect(writtenData.env).toEqual({ FOO: "bar" });
    // Existing hooks should be preserved
    expect(writtenData.hooks).toEqual({ PreToolUse: [] });
  });

  it("rejects arbitrary fields", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({}));

    const res = await request(app)
      .put("/settings")
      .send({ malicious: "payload", model: "opus" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("creates settings.json if missing", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app)
      .put("/settings")
      .send({ model: "claude-opus-4-6" });

    expect(res.status).toBe(200);
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it("rejects empty body", async () => {
    const res = await request(app)
      .put("/settings")
      .send({});

    expect(res.status).toBe(400);
  });
});
