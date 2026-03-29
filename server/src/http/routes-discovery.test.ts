import { describe, it, expect, vi, beforeEach } from "vitest";

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "./routes.js";
import { SessionManager } from "../session/session-manager.js";

describe("Discovery endpoints", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("./server.js").ServerState;
    app = express();
    app.use(setupRoutes(state));
  });

  describe("GET /sessions/:sessionId/models", () => {
    it("returns 404 when session not found", async () => {
      const res = await request(app).get("/sessions/nonexistent/models");
      expect(res.status).toBe(404);
    });

    it("returns fallback model list when no activeQuery", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const res = await request(app).get(`/sessions/${sessionId}/models`);
      expect(res.status).toBe(200);
      expect(res.body.models).toBeDefined();
      expect(Array.isArray(res.body.models)).toBe(true);
      expect(res.body.models.length).toBeGreaterThan(0);
      // Each model should have value and displayName
      expect(res.body.models[0]).toHaveProperty("value");
      expect(res.body.models[0]).toHaveProperty("displayName");
    });

    it("returns SDK models when activeQuery is available", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      const mockModels = [
        { value: "claude-opus-4-6", displayName: "Opus", description: "Most capable" },
      ];
      session.activeQuery = {
        supportedModels: vi.fn().mockResolvedValue(mockModels),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/models`);
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual(mockModels);
    });

    it("returns fallback when activeQuery.supportedModels throws", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      session.activeQuery = {
        supportedModels: vi.fn().mockRejectedValue(new Error("SDK error")),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/models`);
      expect(res.status).toBe(200);
      expect(res.body.models.length).toBeGreaterThan(0);
      expect(res.body.source).toBe("fallback");
    });
  });

  describe("GET /sessions/:sessionId/commands", () => {
    it("returns 404 when session not found", async () => {
      const res = await request(app).get("/sessions/nonexistent/commands");
      expect(res.status).toBe(404);
    });

    it("returns fallback commands when no activeQuery", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const res = await request(app).get(`/sessions/${sessionId}/commands`);
      expect(res.status).toBe(200);
      expect(res.body.commands).toBeDefined();
      expect(Array.isArray(res.body.commands)).toBe(true);
      expect(res.body.commands.length).toBeGreaterThan(0);
      // Each command should have name and description
      expect(res.body.commands[0]).toHaveProperty("name");
      expect(res.body.commands[0]).toHaveProperty("description");
    });

    it("returns SDK commands when activeQuery is available", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      const mockCommands = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "compact", description: "Compact context", argumentHint: "" },
      ];
      session.activeQuery = {
        supportedCommands: vi.fn().mockResolvedValue(mockCommands),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/commands`);
      expect(res.status).toBe(200);
      expect(res.body.commands).toEqual(mockCommands);
    });

    it("returns fallback when activeQuery.supportedCommands throws", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      session.activeQuery = {
        supportedCommands: vi.fn().mockRejectedValue(new Error("SDK error")),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/commands`);
      expect(res.status).toBe(200);
      expect(res.body.commands.length).toBeGreaterThan(0);
      expect(res.body.source).toBe("fallback");
    });
  });

  describe("GET /sessions/:sessionId/agents", () => {
    it("returns 404 when session not found", async () => {
      const res = await request(app).get("/sessions/nonexistent/agents");
      expect(res.status).toBe(404);
    });

    it("returns empty array when no activeQuery", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const res = await request(app).get(`/sessions/${sessionId}/agents`);
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([]);
    });

    it("returns SDK agents when activeQuery is available", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      const mockAgents = [
        { name: "Explore", description: "Explore the codebase" },
      ];
      session.activeQuery = {
        supportedAgents: vi.fn().mockResolvedValue(mockAgents),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/agents`);
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual(mockAgents);
    });

    it("returns empty array when activeQuery.supportedAgents throws", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      session.activeQuery = {
        supportedAgents: vi.fn().mockRejectedValue(new Error("SDK error")),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      const res = await request(app).get(`/sessions/${sessionId}/agents`);
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([]);
      expect(res.body.source).toBe("fallback");
    });
  });
});
