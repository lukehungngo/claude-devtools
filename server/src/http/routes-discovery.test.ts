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
  aggregateEventsPerModel: vi.fn(() => ({ perModel: [], totalCost: 0 })),
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

    // Regression — Bug E: per-session Usage tab fallback was hitting
    // /api/usage/breakdown with no params and the server ignored req.query,
    // returning account-wide aggregate (every project on disk). For a
    // $2.5k session, users saw $48k inflated by other projects/models.
    describe("?sessionId scoping (regression)", () => {
      function makeSession(id: string): import("../types.js").SessionInfo {
        return {
          id,
          projectHash: "ph",
          path: `/tmp/${id}.jsonl`,
          startTime: "2026-05-01T00:00:00Z",
          lastModified: "2026-05-01T00:00:00Z",
          eventCount: 1,
          subagentCount: 0,
        };
      }

      it("without sessionId, aggregates across ALL sessions (back-compat)", async () => {
        const {
          discoverSessions,
        } = await import("../parser/session-discovery.js");
        const {
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        const sessA = makeSession("sess-A");
        const sessB = makeSession("sess-B");
        vi.mocked(discoverSessions).mockReturnValue([sessA, sessB]);
        const aggMock = vi.mocked(aggregatePerModelUsage);
        aggMock.mockReset().mockReturnValue({
          perModel: [],
          totalCost: 0,
        });

        const res = await request(app).get("/usage/breakdown");
        expect(res.status).toBe(200);
        // aggregator received BOTH sessions
        expect(aggMock).toHaveBeenCalledTimes(1);
        const passed = aggMock.mock.calls[0][0] as import("../types.js").SessionInfo[];
        expect(passed.map((s) => s.id).sort()).toEqual(["sess-A", "sess-B"]);
      });

      it("with sessionId, aggregates ONLY the matching session", async () => {
        const {
          discoverSessions,
        } = await import("../parser/session-discovery.js");
        const {
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        const sessA = makeSession("sess-A");
        const sessB = makeSession("sess-B");
        vi.mocked(discoverSessions).mockReturnValue([sessA, sessB]);
        const aggMock = vi.mocked(aggregatePerModelUsage);
        aggMock.mockReset().mockReturnValue({
          perModel: [
            {
              model: "claude-sonnet-4-6",
              inputTokens: 10,
              outputTokens: 5,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              cacheHitRatio: 0,
              totalCost: 0.001,
            },
          ],
          totalCost: 0.001,
        });

        const res = await request(app).get("/usage/breakdown?sessionId=sess-A");
        expect(res.status).toBe(200);
        // aggregator received ONLY sess-A — filtering happened server-side.
        expect(aggMock).toHaveBeenCalledTimes(1);
        const passed = aggMock.mock.calls[0][0] as import("../types.js").SessionInfo[];
        expect(passed.map((s) => s.id)).toEqual(["sess-A"]);
      });

      it("with sessionId that matches nothing, passes empty list (no leak)", async () => {
        const {
          discoverSessions,
        } = await import("../parser/session-discovery.js");
        const {
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        vi.mocked(discoverSessions).mockReturnValue([
          makeSession("sess-A"),
          makeSession("sess-B"),
        ]);
        const aggMock = vi.mocked(aggregatePerModelUsage);
        aggMock.mockReset().mockReturnValue({
          perModel: [],
          totalCost: 0,
        });

        const res = await request(app).get("/usage/breakdown?sessionId=none");
        expect(res.status).toBe(200);
        expect(aggMock).toHaveBeenCalledTimes(1);
        const passed = aggMock.mock.calls[0][0] as import("../types.js").SessionInfo[];
        expect(passed).toEqual([]);
      });
    });

    // Bug H: per-turn scoping. When the Usage tab is anchored on a single
    // turn, the dashboard passes `?sessionId=…&fromTs=…&toTs=…` (ISO-8601
    // timestamps from the TurnSnapshot's startTime/endTime — frame-
    // independent so dashboard/server event orderings can't desync).
    // The server loads ONLY that one session via loadFullSession, slices
    // events by timestamp range, and aggregates the slice via the sibling
    // `aggregateEventsPerModel`. The whole-session `aggregatePerModelUsage`
    // path is bypassed when the range is supplied.
    describe("?fromTs/?toTs turn scoping (Bug H regression)", () => {
      function makeSession(id: string): import("../types.js").SessionInfo {
        return {
          id,
          projectHash: "ph",
          path: `/tmp/${id}.jsonl`,
          startTime: "2026-05-01T00:00:00Z",
          lastModified: "2026-05-01T00:00:00Z",
          eventCount: 1,
          subagentCount: 0,
        };
      }

      function makeAssistantEvent(
        uuid: string,
        timestamp: string,
        model: string,
      ): import("../types.js").SessionEvent {
        return {
          type: "assistant",
          uuid,
          timestamp,
          sessionId: "sess-T",
          message: {
            id: `msg-${uuid}`,
            type: "message",
            role: "assistant",
            model,
            content: [],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        } as unknown as import("../types.js").SessionEvent;
      }

      it("with sessionId + fromTs + toTs, slices events by [fromTs, toTs) and aggregates only that slice", async () => {
        const {
          discoverSessions,
          loadFullSession,
        } = await import("../parser/session-discovery.js");
        const {
          aggregateEventsPerModel,
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        const sess = makeSession("sess-T");
        vi.mocked(discoverSessions).mockReturnValue([sess]);

        // Three events spanning three "turns" by timestamp window.
        const e1 = makeAssistantEvent("u1", "2026-05-01T00:00:00.000Z", "claude-sonnet-4-6"); // before window
        const e2 = makeAssistantEvent("u2", "2026-05-01T00:01:00.000Z", "claude-sonnet-4-6"); // IN window
        const e3 = makeAssistantEvent("u3", "2026-05-01T00:02:00.000Z", "claude-sonnet-4-6"); // after window (toTs is exclusive)
        vi.mocked(loadFullSession).mockReturnValue({
          mainEvents: [e1, e2, e3],
          subagentEvents: new Map(),
          subagentMeta: new Map(),
        });

        const sliceMock = vi.mocked(aggregateEventsPerModel);
        sliceMock.mockReset().mockReturnValue({
          perModel: [
            {
              model: "claude-sonnet-4-6",
              inputTokens: 100,
              outputTokens: 50,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              cacheHitRatio: 0,
              totalCost: 0.001,
            },
          ],
          totalCost: 0.001,
        });
        const wholeMock = vi.mocked(aggregatePerModelUsage);
        wholeMock.mockReset();

        const res = await request(app).get(
          "/usage/breakdown?sessionId=sess-T&fromTs=2026-05-01T00:00:30.000Z&toTs=2026-05-01T00:01:30.000Z",
        );
        expect(res.status).toBe(200);
        // Whole-session aggregator MUST NOT be called when the turn slice is requested.
        expect(wholeMock).not.toHaveBeenCalled();
        // The slice aggregator was called with ONLY the in-window event(s).
        expect(sliceMock).toHaveBeenCalledTimes(1);
        const slicedEvents = sliceMock.mock.calls[0][0] as import("../types.js").SessionEvent[];
        expect(slicedEvents.map((e) => e.uuid)).toEqual(["u2"]);
        expect(res.body.breakdown.totalCost).toBe(0.001);
      });

      it("fromTs/toTs without sessionId is ignored (back-compat: whole-session aggregator runs)", async () => {
        // Range params only have meaning together with a sessionId — the
        // dashboard always sends them as a triplet. If only the range
        // arrives, fall back to the legacy whole-session path so the
        // back-compat global aggregate is preserved.
        const {
          discoverSessions,
        } = await import("../parser/session-discovery.js");
        const {
          aggregateEventsPerModel,
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        vi.mocked(discoverSessions).mockReturnValue([makeSession("sess-A")]);
        const sliceMock = vi.mocked(aggregateEventsPerModel);
        sliceMock.mockReset();
        const wholeMock = vi.mocked(aggregatePerModelUsage);
        wholeMock.mockReset().mockReturnValue({ perModel: [], totalCost: 0 });

        const res = await request(app).get(
          "/usage/breakdown?fromTs=2026-05-01T00:00:00.000Z&toTs=2026-05-01T01:00:00.000Z",
        );
        expect(res.status).toBe(200);
        expect(sliceMock).not.toHaveBeenCalled();
        expect(wholeMock).toHaveBeenCalledTimes(1);
      });

      it("sessionId + range with no events in the window returns empty breakdown (no error)", async () => {
        const {
          discoverSessions,
          loadFullSession,
        } = await import("../parser/session-discovery.js");
        const {
          aggregateEventsPerModel,
        } = await import("../analyzer/usage-breakdown.js");
        const sess = makeSession("sess-T");
        vi.mocked(discoverSessions).mockReturnValue([sess]);
        vi.mocked(loadFullSession).mockReturnValue({
          mainEvents: [
            makeAssistantEvent("u1", "2026-04-01T00:00:00.000Z", "claude-sonnet-4-6"),
          ],
          subagentEvents: new Map(),
          subagentMeta: new Map(),
        });
        const sliceMock = vi.mocked(aggregateEventsPerModel);
        sliceMock.mockReset().mockReturnValue({ perModel: [], totalCost: 0 });

        const res = await request(app).get(
          "/usage/breakdown?sessionId=sess-T&fromTs=2026-05-01T00:00:00.000Z&toTs=2026-05-01T01:00:00.000Z",
        );
        expect(res.status).toBe(200);
        // Slice aggregator was still called — with an empty array.
        expect(sliceMock).toHaveBeenCalledTimes(1);
        const slicedEvents = sliceMock.mock.calls[0][0] as import("../types.js").SessionEvent[];
        expect(slicedEvents).toEqual([]);
        expect(res.body.breakdown).toEqual({ perModel: [], totalCost: 0 });
      });

      // Boundary regression: TurnSnapshot.endTime IS the timestamp of the
      // turn's last event (often the assistant's end_turn message — the one
      // that carries the bulk of the per-turn cost). A strict `<` upper bound
      // would drop it and undercount the turn. The server window is closed
      // on both ends: [fromTs, toTs].
      it("includes events whose timestamp equals toTs (CLOSED upper bound)", async () => {
        const {
          discoverSessions,
          loadFullSession,
        } = await import("../parser/session-discovery.js");
        const {
          aggregateEventsPerModel,
        } = await import("../analyzer/usage-breakdown.js");
        const sess = makeSession("sess-T");
        vi.mocked(discoverSessions).mockReturnValue([sess]);

        // Two events: the first sits exactly on fromTs, the second exactly
        // on toTs. Both must be included (TurnSnapshot.startTime = first
        // event's ts, endTime = last event's ts — closed on both ends).
        const eFirst = makeAssistantEvent("u-first", "2026-05-01T00:00:30.000Z", "claude-sonnet-4-6");
        const eLast = makeAssistantEvent("u-last", "2026-05-01T00:01:00.000Z", "claude-sonnet-4-6");
        vi.mocked(loadFullSession).mockReturnValue({
          mainEvents: [eFirst, eLast],
          subagentEvents: new Map(),
          subagentMeta: new Map(),
        });
        const sliceMock = vi.mocked(aggregateEventsPerModel);
        sliceMock.mockReset().mockReturnValue({ perModel: [], totalCost: 0 });

        const res = await request(app).get(
          "/usage/breakdown?sessionId=sess-T&fromTs=2026-05-01T00:00:30.000Z&toTs=2026-05-01T00:01:00.000Z",
        );
        expect(res.status).toBe(200);
        expect(sliceMock).toHaveBeenCalledTimes(1);
        const slicedEvents = sliceMock.mock.calls[0][0] as import("../types.js").SessionEvent[];
        expect(slicedEvents.map((e) => e.uuid)).toEqual(["u-first", "u-last"]);
      });

      it("sessionId + range with unknown sessionId returns empty (no leak to other sessions)", async () => {
        const {
          discoverSessions,
          loadFullSession,
        } = await import("../parser/session-discovery.js");
        const {
          aggregateEventsPerModel,
          aggregatePerModelUsage,
        } = await import("../analyzer/usage-breakdown.js");
        vi.mocked(discoverSessions).mockReturnValue([makeSession("sess-A")]);
        const sliceMock = vi.mocked(aggregateEventsPerModel);
        sliceMock.mockReset().mockReturnValue({ perModel: [], totalCost: 0 });
        const wholeMock = vi.mocked(aggregatePerModelUsage);
        wholeMock.mockReset();
        const loadMock = vi.mocked(loadFullSession);
        loadMock.mockReset();

        const res = await request(app).get(
          "/usage/breakdown?sessionId=none&fromTs=2026-05-01T00:00:00.000Z&toTs=2026-05-01T01:00:00.000Z",
        );
        expect(res.status).toBe(200);
        // No JSONL load attempted for an unknown sessionId.
        expect(loadMock).not.toHaveBeenCalled();
        // No whole-session leak.
        expect(wholeMock).not.toHaveBeenCalled();
        // Slice aggregator called with empty list (explicit "no leak").
        expect(sliceMock).toHaveBeenCalledTimes(1);
        const slicedEvents = sliceMock.mock.calls[0][0] as import("../types.js").SessionEvent[];
        expect(slicedEvents).toEqual([]);
      });
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
