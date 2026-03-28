import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../http/routes.js";
import type { ServerState } from "../http/server.js";
import { DebugDB } from "../debug/debug-db.js";

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

describe("Debug REST endpoints", () => {
  let db: DebugDB;
  let state: ServerState;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    db = createTestDB();
    state = { clients: new Set(), debugDb: db };
    app = createApp(state);
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/debug/sessions", () => {
    it("returns 404 when debugDb is not available", async () => {
      const appNoDb = createApp({ clients: new Set() });
      const res = await request(appNoDb).get("/api/debug/sessions").expect(404);
      expect(res.body.error).toMatch(/Debug DB not available/);
    });

    it("returns empty list when no sessions", async () => {
      const res = await request(app).get("/api/debug/sessions").expect(200);
      expect(res.body).toEqual([]);
    });

    it("returns sessions with turn and agent counts", async () => {
      db.upsertSession({ sessionId: "s1", lastUpdated: "2026-01-01T00:00:00Z" });
      db.upsertTurn({ sessionId: "s1", turnNumber: 1, status: "completed" });
      db.upsertTurn({ sessionId: "s1", turnNumber: 2, status: "running" });
      db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "main" });

      const res = await request(app).get("/api/debug/sessions").expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].sessionId).toBe("s1");
      expect(res.body[0].turnCount).toBe(2);
      expect(res.body[0].agentCount).toBe(1);
    });
  });

  describe("GET /api/debug/sessions/:sessionId/turns", () => {
    it("returns 404 when debugDb is not available", async () => {
      const appNoDb = createApp({ clients: new Set() });
      const res = await request(appNoDb)
        .get("/api/debug/sessions/s1/turns")
        .expect(404);
      expect(res.body.error).toMatch(/Debug DB not available/);
    });

    it("returns turns with agent and event counts", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.upsertTurn({ sessionId: "s1", turnNumber: 1, status: "completed" });
      db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "main" });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        eventType: "user",
        eventUuid: "e1",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns")
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].turnNumber).toBe(1);
      expect(res.body[0].agentCount).toBe(1);
      expect(res.body[0].eventCount).toBe(1);
    });
  });

  describe("GET /api/debug/sessions/:sessionId/turns/:turnNumber/agents", () => {
    it("returns agent lifecycles for a turn", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.upsertAgentLifecycle({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        agentType: "main",
        status: "completed",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns/1/agents")
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].agentId).toBe("main");
      expect(res.body[0].agentType).toBe("main");
    });
  });

  describe("GET /api/debug/sessions/:sessionId/turns/:turnNumber/events", () => {
    it("returns events for a turn", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        eventType: "user",
        eventUuid: "e1",
      });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "sub1",
        eventType: "assistant",
        eventUuid: "e2",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns/1/events")
        .expect(200);
      expect(res.body).toHaveLength(2);
    });

    it("filters events by agentId query param", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        eventType: "user",
        eventUuid: "e1",
      });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "sub1",
        eventType: "assistant",
        eventUuid: "e2",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns/1/events?agentId=sub1")
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].agentId).toBe("sub1");
    });
  });

  describe("GET /api/debug/sessions/:sessionId/turns/:turnNumber/graph", () => {
    it("returns graph data up to event limit", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.upsertAgentLifecycle({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        agentType: "main",
      });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        eventType: "user",
        eventUuid: "e1",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns/1/graph?upToEvent=10")
        .expect(200);
      expect(res.body).toHaveProperty("agents");
      expect(res.body).toHaveProperty("events");
      expect(res.body.agents).toHaveLength(1);
      expect(res.body.events).toHaveLength(1);
    });

    it("defaults upToEvent to large number when not provided", async () => {
      db.upsertSession({ sessionId: "s1" });
      db.insertEvent({
        sessionId: "s1",
        turnNumber: 1,
        agentId: "main",
        eventType: "user",
        eventUuid: "e1",
      });

      const res = await request(app)
        .get("/api/debug/sessions/s1/turns/1/graph")
        .expect(200);
      expect(res.body.events).toHaveLength(1);
    });
  });
});
