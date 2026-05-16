import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing routes
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

// Mock the global CommandCache so tests get deterministic control over the
// global-cache tier (the real cache reads ~/.claude/devtools/command-cache.json
// from disk, which would otherwise leak into test assertions).
// Use vi.hoisted to ensure the mock functions exist when vi.mock's factory runs.
const {
  commandCacheGetMock,
  commandCacheUpdateMock,
  commandCacheBootstrapMock,
} = vi.hoisted(() => ({
  commandCacheGetMock: vi.fn<() => Array<{ name: string; description: string; argumentHint?: string }> | null>(() => null),
  commandCacheUpdateMock: vi.fn(),
  commandCacheBootstrapMock: vi.fn(),
}));
vi.mock("../discovery/command-cache.js", () => ({
  CommandCache: class MockCommandCache {
    get = commandCacheGetMock;
    update = commandCacheUpdateMock;
    bootstrap = commandCacheBootstrapMock;
  },
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
vi.mock("../analyzer/usage-breakdown.js", () => ({
  aggregatePerModelUsage: vi.fn(() => ({ perModel: [], totalCost: 0 })),
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
    // Reset command cache mocks to the default (empty) state
    commandCacheGetMock.mockReset().mockReturnValue(null);
    commandCacheUpdateMock.mockReset();
    commandCacheBootstrapMock.mockReset();
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

  describe("GET /usage/breakdown", () => {
    it("returns the aggregated per-model usage breakdown", async () => {
      const { aggregatePerModelUsage } = await import(
        "../analyzer/usage-breakdown.js"
      );
      vi.mocked(aggregatePerModelUsage).mockReturnValue({
        perModel: [
          {
            model: "claude-sonnet-4-6",
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 200,
            cacheReadTokens: 700,
            cacheHitRatio: 0.7,
            totalCost: 0.123,
          },
        ],
        totalCost: 0.123,
      });

      const res = await request(app).get("/usage/breakdown");
      expect(res.status).toBe(200);
      expect(res.body.breakdown.perModel).toHaveLength(1);
      expect(res.body.breakdown.perModel[0].model).toBe("claude-sonnet-4-6");
      expect(res.body.breakdown.perModel[0].cacheHitRatio).toBe(0.7);
      expect(res.body.breakdown.totalCost).toBe(0.123);
    });

    it("returns 500 when aggregation throws", async () => {
      const { aggregatePerModelUsage } = await import(
        "../analyzer/usage-breakdown.js"
      );
      vi.mocked(aggregatePerModelUsage).mockImplementation(() => {
        throw new Error("boom");
      });

      const res = await request(app).get("/usage/breakdown");
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("GET /sessions/:sessionId/commands", () => {
    it("returns 200 with static fallback for historical (unknown) sessions", async () => {
      // Historical sessions are not tracked by SessionManager. The endpoint
      // must not 404 — it should fall through to the global cache / static
      // fallback so the dashboard can always render slash commands.
      const res = await request(app).get("/sessions/nonexistent/commands");
      expect(res.status).toBe(200);
      expect(res.body.source).toBe("fallback");
      expect(Array.isArray(res.body.commands)).toBe(true);
      expect(res.body.commands.length).toBeGreaterThan(0);
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

    it("returns cached commands when activeQuery is cleared (idle session)", async () => {
      const sessionId = await sessionManager.startSession("/tmp");
      const session = sessionManager.getStatus(sessionId)!;
      const sdkCommands = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "my-skill", description: "Marketplace skill", argumentHint: "" },
      ];
      // Simulate: activeQuery available, commands fetched and cached
      session.activeQuery = {
        supportedCommands: vi.fn().mockResolvedValue(sdkCommands),
      } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

      // First fetch — should get SDK commands and cache them
      const res1 = await request(app).get(`/sessions/${sessionId}/commands`);
      expect(res1.body.commands).toEqual(sdkCommands);
      expect(res1.body.source).toBe("sdk");

      // Clear activeQuery (session goes idle)
      session.activeQuery = undefined;

      // Second fetch — should get cached commands, not fallback
      const res2 = await request(app).get(`/sessions/${sessionId}/commands`);
      expect(res2.body.commands).toEqual(sdkCommands);
      expect(res2.body.source).toBe("cached");
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

    describe("historical (non-active) sessions", () => {
      it("returns 200 with global-cache tier when cache is warm", async () => {
        // Historical session — not tracked by SessionManager — plus a warm
        // global cache (e.g. a prior active session populated it). The
        // endpoint must return the cached commands, not 404.
        const cached = [
          { name: "help", description: "Show help", argumentHint: "" },
          { name: "clear", description: "Clear context", argumentHint: "" },
        ];
        commandCacheGetMock.mockReturnValue(cached);

        const res = await request(app).get("/sessions/historical-id/commands");
        expect(res.status).toBe(200);
        expect(res.body.source).toBe("global-cache");
        expect(res.body.commands).toEqual(cached);
      });

      it("active session with SDK still returns sdk tier (unchanged)", async () => {
        // Regression guard: the fix for historical sessions must not perturb
        // the active-session SDK path.
        const sessionId = await sessionManager.startSession("/tmp");
        const session = sessionManager.getStatus(sessionId)!;
        const sdkCommands = [
          { name: "help", description: "Show help", argumentHint: "" },
        ];
        session.activeQuery = {
          supportedCommands: vi.fn().mockResolvedValue(sdkCommands),
        } as unknown as import("@anthropic-ai/claude-agent-sdk").Query;

        const res = await request(app).get(`/sessions/${sessionId}/commands`);
        expect(res.status).toBe(200);
        expect(res.body.source).toBe("sdk");
        expect(res.body.commands).toEqual(sdkCommands);
      });
    });
  });

  describe("GET /repos — isRunning resolution priority", () => {
    // Priority (highest first):
    //   1. SessionManager has it → "streaming"|"waiting-permission" ⇒ running
    //   2. Daemon entry exists AND daemonAlive ⇒ daemonStatus === "busy"
    //   3. Mtime within RUNNING_THRESHOLD_MS (2 min) — fallback
    // Stale daemon (daemonAlive === false) falls through to mtime.

    function makeRepo(
      session: {
        id: string;
        lastModified: string;
        daemonStatus?: string;
        daemonAlive?: boolean;
      },
    ): { cwd: string; repoName: string; sessions: unknown[]; lastActive: string; hasActiveSessions: boolean } {
      return {
        cwd: "/tmp/x",
        repoName: "x",
        sessions: [
          {
            id: session.id,
            projectHash: "ph",
            path: "/tmp/x/x.jsonl",
            startTime: "2026-04-17T10:00:00Z",
            lastModified: session.lastModified,
            eventCount: 1,
            subagentCount: 0,
            daemonStatus: session.daemonStatus,
            daemonAlive: session.daemonAlive,
            isRunning: false,
          },
        ],
        lastActive: session.lastModified,
        hasActiveSessions: false,
      };
    }

    it("SessionManager wins: streaming ⇒ isRunning=true even when daemon says idle", async () => {
      const { discoverRepoGroups } = await import("../parser/session-discovery.js");
      const oldMtime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago — past mtime threshold
      const repo = makeRepo({
        id: "sess-mgr-wins",
        lastModified: oldMtime,
        daemonStatus: "idle",
        daemonAlive: true,
      });
      vi.mocked(discoverRepoGroups).mockReturnValue([repo as unknown as import("../types.js").RepoGroup]);

      // Add session to manager with streaming status
      await sessionManager.startSession("/tmp");
      // The manager assigns its own ID — override to match our repo session id
      const managed = sessionManager.getActiveSessions()[0];
      managed.sessionId = "sess-mgr-wins";
      managed.status = "streaming";

      const res = await request(app).get("/repos");
      expect(res.status).toBe(200);
      expect(res.body.repos[0].sessions[0].isRunning).toBe(true);
    });

    it("daemon wins over mtime: busy + alive ⇒ isRunning=true even with stale mtime", async () => {
      const { discoverRepoGroups } = await import("../parser/session-discovery.js");
      const staleMtime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const repo = makeRepo({
        id: "sess-daemon-busy",
        lastModified: staleMtime,
        daemonStatus: "busy",
        daemonAlive: true,
      });
      vi.mocked(discoverRepoGroups).mockReturnValue([repo as unknown as import("../types.js").RepoGroup]);

      const res = await request(app).get("/repos");
      expect(res.status).toBe(200);
      expect(res.body.repos[0].sessions[0].isRunning).toBe(true);
    });

    it("daemon authoritative idle + alive ⇒ isRunning=false even when mtime fresh", async () => {
      const { discoverRepoGroups } = await import("../parser/session-discovery.js");
      const freshMtime = new Date(Date.now() - 30 * 1000).toISOString(); // 30s ago — would be running by mtime
      const repo = makeRepo({
        id: "sess-daemon-idle",
        lastModified: freshMtime,
        daemonStatus: "idle",
        daemonAlive: true,
      });
      vi.mocked(discoverRepoGroups).mockReturnValue([repo as unknown as import("../types.js").RepoGroup]);

      const res = await request(app).get("/repos");
      expect(res.status).toBe(200);
      expect(res.body.repos[0].sessions[0].isRunning).toBe(false);
    });

    it("stale daemon (daemonAlive=false) falls through to mtime — fresh mtime ⇒ running", async () => {
      const { discoverRepoGroups } = await import("../parser/session-discovery.js");
      const freshMtime = new Date(Date.now() - 30 * 1000).toISOString();
      const repo = makeRepo({
        id: "sess-daemon-stale",
        lastModified: freshMtime,
        // Daemon entry exists but its process is gone — must NOT be authoritative.
        daemonStatus: "busy",
        daemonAlive: false,
      });
      vi.mocked(discoverRepoGroups).mockReturnValue([repo as unknown as import("../types.js").RepoGroup]);

      const res = await request(app).get("/repos");
      expect(res.status).toBe(200);
      expect(res.body.repos[0].sessions[0].isRunning).toBe(true); // mtime path
    });

    it("no daemon entry + stale mtime ⇒ isRunning=false (mtime fallback)", async () => {
      const { discoverRepoGroups } = await import("../parser/session-discovery.js");
      const staleMtime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const repo = makeRepo({
        id: "sess-no-daemon",
        lastModified: staleMtime,
        daemonStatus: undefined,
        daemonAlive: undefined,
      });
      vi.mocked(discoverRepoGroups).mockReturnValue([repo as unknown as import("../types.js").RepoGroup]);

      const res = await request(app).get("/repos");
      expect(res.status).toBe(200);
      expect(res.body.repos[0].sessions[0].isRunning).toBe(false);
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
