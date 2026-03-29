import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupRoutes } from "../http/routes.js";
import { SessionManager } from "../session/session-manager.js";
import type { ServerState } from "../http/server.js";

// Mock the SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  sessionLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("MCP write endpoints: POST /mcp/servers", () => {
  let app: ReturnType<typeof express>;
  let sessionManager: SessionManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });

    sessionManager = new SessionManager(vi.fn());
    const state: ServerState = { clients: new Set(), sessionManager };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/mcp/servers")
      .send({ command: "node", args: [] })
      .expect(400);

    expect(res.body.error).toContain("name");
  });

  it("returns 400 when command is missing", async () => {
    const res = await request(app)
      .post("/api/mcp/servers")
      .send({ name: "test-server", args: [] })
      .expect(400);

    expect(res.body.error).toContain("command");
  });

  it("adds a new server to .mcp.json in the specified project path", async () => {
    // Write an initial .mcp.json
    writeFileSync(join(tmpDir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));

    const res = await request(app)
      .post("/api/mcp/servers")
      .send({
        name: "my-server",
        command: "node",
        args: ["server.js"],
        env: { PORT: "3000" },
        projectPath: tmpDir,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.server.name).toBe("my-server");

    // Verify file was written correctly
    const written = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(written.mcpServers["my-server"]).toBeDefined();
    expect(written.mcpServers["my-server"].command).toBe("node");
    expect(written.mcpServers["my-server"].args).toEqual(["server.js"]);
    expect(written.mcpServers["my-server"].env).toEqual({ PORT: "3000" });
  });

  it("creates .mcp.json if it does not exist", async () => {
    const res = await request(app)
      .post("/api/mcp/servers")
      .send({
        name: "new-server",
        command: "npx",
        args: ["-y", "@mcp/test"],
        projectPath: tmpDir,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(true);
  });

  it("preserves existing servers when adding a new one", async () => {
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          existing: { command: "existing-cmd", args: [] },
        },
      }),
    );

    await request(app)
      .post("/api/mcp/servers")
      .send({
        name: "new-server",
        command: "new-cmd",
        args: [],
        projectPath: tmpDir,
      })
      .expect(200);

    const written = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(written.mcpServers["existing"]).toBeDefined();
    expect(written.mcpServers["new-server"]).toBeDefined();
  });

  it("returns 409 if server name already exists", async () => {
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "existing-server": { command: "cmd", args: [] },
        },
      }),
    );

    const res = await request(app)
      .post("/api/mcp/servers")
      .send({
        name: "existing-server",
        command: "new-cmd",
        args: [],
        projectPath: tmpDir,
      })
      .expect(409);

    expect(res.body.error).toContain("already exists");
  });
});

describe("MCP write endpoints: DELETE /mcp/servers/:name", () => {
  let app: ReturnType<typeof express>;
  let sessionManager: SessionManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });

    sessionManager = new SessionManager(vi.fn());
    const state: ServerState = { clients: new Set(), sessionManager };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("removes a server from .mcp.json", async () => {
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "to-remove": { command: "cmd", args: [] },
          "keep-this": { command: "cmd2", args: [] },
        },
      }),
    );

    const res = await request(app)
      .delete("/api/mcp/servers/to-remove")
      .send({ projectPath: tmpDir })
      .expect(200);

    expect(res.body.success).toBe(true);

    const written = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(written.mcpServers["to-remove"]).toBeUndefined();
    expect(written.mcpServers["keep-this"]).toBeDefined();
  });

  it("returns 404 if server name not found", async () => {
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({ mcpServers: {} }),
    );

    const res = await request(app)
      .delete("/api/mcp/servers/nonexistent")
      .send({ projectPath: tmpDir })
      .expect(404);

    expect(res.body.error).toContain("not found");
  });

  it("returns 404 if .mcp.json does not exist", async () => {
    const res = await request(app)
      .delete("/api/mcp/servers/any-server")
      .send({ projectPath: tmpDir })
      .expect(404);

    expect(res.body.error).toContain("not found");
  });
});
