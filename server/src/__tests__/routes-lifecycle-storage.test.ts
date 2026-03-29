import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../http/routes.js";
import type { ServerState } from "../http/server.js";
import { DebugDB } from "../debug/debug-db.js";
import type { SessionInfo, SessionEvent } from "../types.js";

// Mock session-discovery to control test data
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(),
  discoverRepoGroups: vi.fn(),
  loadFullSession: vi.fn(),
}));

// Mock metrics to avoid real computation
vi.mock("../analyzer/metrics.js", () => ({
  computeMetrics: vi.fn(() => ({
    sessionId: "test-session",
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCost: 0.01,
    events: [],
    dagNodes: [],
    dagEdges: [],
    turns: [],
    subagentMap: {},
  })),
}));

import {
  discoverSessions,
  loadFullSession,
} from "../parser/session-discovery.js";

const mockDiscoverSessions = vi.mocked(discoverSessions);
const mockLoadFullSession = vi.mocked(loadFullSession);

function createTestDB(): DebugDB {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const db = DebugDB.open(":memory:");
  process.env.NODE_ENV = prev;
  return db!;
}

function createApp(state?: ServerState) {
  const app = express();
  app.use("/api", setupRoutes(state));
  return app;
}

function makeEvent(
  overrides: Partial<SessionEvent> & { type: string; uuid: string; timestamp: string }
): SessionEvent {
  return {
    ...overrides,
  } as SessionEvent;
}

function makeUserEvent(uuid: string, timestamp: string, text: string): SessionEvent {
  return {
    type: "user",
    uuid,
    timestamp,
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  } as unknown as SessionEvent;
}

function makeAssistantEvent(uuid: string, timestamp: string): SessionEvent {
  return {
    type: "assistant",
    uuid,
    timestamp,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "response" }],
      stop_reason: "end_turn",
      model: "claude-sonnet-4-20250514",
    },
  } as unknown as SessionEvent;
}

describe("Session fetch stores lifecycle data in debug DB", () => {
  let db: DebugDB;
  let state: ServerState;
  let app: ReturnType<typeof express>;

  const testSession: SessionInfo = {
    id: "test-session",
    projectHash: "abc123",
    path: "/fake/path/session.jsonl",
    startTime: "2026-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:01:00Z",
    eventCount: 4,
    subagentCount: 0,
    cwd: "/tmp/test-project",
    model: "claude-sonnet-4-20250514",
  };

  beforeEach(() => {
    db = createTestDB();
    state = { clients: new Set(), debugDb: db };
    app = createApp(state);

    mockDiscoverSessions.mockReturnValue([testSession]);

    const mainEvents: SessionEvent[] = [
      makeUserEvent("u1", "2026-01-01T00:00:01Z", "Hello"),
      makeAssistantEvent("a1", "2026-01-01T00:00:02Z"),
      makeUserEvent("u2", "2026-01-01T00:00:03Z", "Follow-up"),
      makeAssistantEvent("a2", "2026-01-01T00:00:04Z"),
    ];

    mockLoadFullSession.mockReturnValue({
      mainEvents,
      subagentEvents: new Map(),
      subagentMeta: new Map(),
    });
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it("stores session record in debug DB after fetch", async () => {
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    const stored = db.getSession("test-session");
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe("test-session");
    expect(stored!.projectHash).toBe("abc123");
    expect(stored!.cwd).toBe("/tmp/test-project");
    expect(stored!.model).toBe("claude-sonnet-4-20250514");
    expect(stored!.lastUpdated).toBeTruthy();
  });

  it("stores turns in debug DB after fetch", async () => {
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    const turns = db.getTurns("test-session");
    expect(turns.length).toBeGreaterThanOrEqual(1);
    // First turn should have the prompt text
    const turn1 = turns.find((t) => t.turnNumber === 1);
    expect(turn1).toBeDefined();
    expect(turn1!.promptText).toBe("Hello");
  });

  it("stores agent lifecycles in debug DB after fetch", async () => {
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    const agents = db.getAgentLifecycles("test-session");
    expect(agents.length).toBeGreaterThanOrEqual(1);
    const mainAgent = agents.find((a) => a.agentId === "main");
    expect(mainAgent).toBeDefined();
    expect(mainAgent!.agentType).toBe("main");
  });

  it("stores lifecycle events in debug DB after fetch", async () => {
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    const events = db.getLifecycleEvents("test-session");
    expect(events.length).toBe(4); // 2 user + 2 assistant
    const uuids = events.map((e) => e.eventUuid);
    expect(uuids).toContain("u1");
    expect(uuids).toContain("a1");
    expect(uuids).toContain("u2");
    expect(uuids).toContain("a2");
  });

  it("does not affect response when debugDb is absent", async () => {
    const stateNoDb: ServerState = { clients: new Set() };
    const appNoDb = createApp(stateNoDb);

    const res = await request(appNoDb)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    expect(res.body).toHaveProperty("metrics");
    expect(res.body).toHaveProperty("events");
  });

  it("does not fail the response when debugDb write throws", async () => {
    // Close DB to force writes to throw
    db.close();

    // Recreate state with closed DB — writes will fail
    const closedDb = createTestDB();
    closedDb.close();
    const stateClosedDb: ServerState = {
      clients: new Set(),
      debugDb: closedDb,
    };
    const appClosedDb = createApp(stateClosedDb);

    const res = await request(appClosedDb)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    expect(res.body).toHaveProperty("metrics");
  });

  it("deduplicates events on repeated fetches", async () => {
    // Fetch twice
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);
    await request(app)
      .get("/api/sessions/abc123/test-session")
      .expect(200);

    // Events should still be 4 (INSERT OR IGNORE deduplicates by eventUuid)
    const events = db.getLifecycleEvents("test-session");
    expect(events.length).toBe(4);
  });
});
