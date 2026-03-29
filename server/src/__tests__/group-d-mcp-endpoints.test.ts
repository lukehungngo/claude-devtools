import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
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

describe("MCP status endpoint: GET /sessions/:sessionId/mcp/status", () => {
  let app: ReturnType<typeof express>;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager(vi.fn());
    const state: ServerState = { clients: new Set(), sessionManager };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns settings source when no active query exists", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/mcp/status`)
      .expect(200);

    // Source should be "settings" since no activeQuery
    expect(res.body.source).toBe("settings");
    expect(Array.isArray(res.body.servers)).toBe(true);
  });

  it("returns settings source for unknown session", async () => {
    const res = await request(app)
      .get("/api/sessions/nonexistent/mcp/status")
      .expect(200);

    expect(res.body.source).toBe("settings");
  });
});

describe("MCP toggle endpoint: POST /sessions/:sessionId/mcp/toggle", () => {
  let app: ReturnType<typeof express>;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state: ServerState = { clients: new Set(), sessionManager };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns 400 when serverName is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/mcp/toggle`)
      .send({ enabled: true })
      .expect(400);

    expect(res.body.error).toContain("serverName");
  });

  it("returns 400 when enabled is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/mcp/toggle`)
      .send({ serverName: "test-server" })
      .expect(400);

    expect(res.body.error).toContain("enabled");
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/api/sessions/nonexistent/mcp/toggle")
      .send({ serverName: "test-server", enabled: true })
      .expect(404);

    expect(res.body.error).toContain("Session not found");
  });

  it("returns 400 when no active query exists", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/mcp/toggle`)
      .send({ serverName: "test-server", enabled: true })
      .expect(400);

    expect(res.body.error).toContain("No active query");
  });
});

describe("MCP reconnect endpoint: POST /sessions/:sessionId/mcp/reconnect", () => {
  let app: ReturnType<typeof express>;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state: ServerState = { clients: new Set(), sessionManager };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns 400 when serverName is missing", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/mcp/reconnect`)
      .send({})
      .expect(400);

    expect(res.body.error).toContain("serverName");
  });

  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .post("/api/sessions/nonexistent/mcp/reconnect")
      .send({ serverName: "test-server" })
      .expect(404);

    expect(res.body.error).toContain("Session not found");
  });

  it("returns 400 when no active query exists", async () => {
    const sessionId = await sessionManager.startSession("/tmp");

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/mcp/reconnect`)
      .send({ serverName: "test-server" })
      .expect(400);

    expect(res.body.error).toContain("No active query");
  });
});
