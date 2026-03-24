import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../http/routes.js";
import type { ServerState } from "../http/server.js";
import { SessionManager } from "../session/session-manager.js";

function createTestState(): ServerState {
  const broadcastFn = vi.fn();
  const sessionManager = new SessionManager(broadcastFn);
  return {
    clients: new Set(),
    sessionManager,
  };
}

function createApp(state?: ServerState) {
  const app = express();
  app.use("/api", setupRoutes(state));
  return app;
}

describe("Session lifecycle routes", () => {
  let state: ServerState;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    state = createTestState();
    app = createApp(state);
  });

  describe("POST /api/sessions/new", () => {
    it("returns sessionId when cwd is provided", async () => {
      const res = await request(app)
        .post("/api/sessions/new")
        .send({ cwd: "/tmp/test-project" })
        .expect(200);

      expect(res.body).toHaveProperty("sessionId");
      expect(typeof res.body.sessionId).toBe("string");
      expect(res.body.sessionId.length).toBeGreaterThan(0);
    });

    it("returns 400 when cwd is missing", async () => {
      const res = await request(app)
        .post("/api/sessions/new")
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toContain("cwd");
    });

    it("returns 400 when cwd is not a string", async () => {
      const res = await request(app)
        .post("/api/sessions/new")
        .send({ cwd: 123 })
        .expect(400);

      expect(res.body).toHaveProperty("error");
    });
  });

  describe("GET /api/sessions/active", () => {
    it("returns empty array when no sessions exist", async () => {
      const res = await request(app)
        .get("/api/sessions/active")
        .expect(200);

      expect(res.body).toEqual({ sessions: [] });
    });

    it("returns sessions after one is created", async () => {
      // Create a session first
      const createRes = await request(app)
        .post("/api/sessions/new")
        .send({ cwd: "/tmp/test" });

      const res = await request(app)
        .get("/api/sessions/active")
        .expect(200);

      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0]).toHaveProperty("sessionId", createRes.body.sessionId);
      expect(res.body.sessions[0]).toHaveProperty("cwd", "/tmp/test");
      expect(res.body.sessions[0]).toHaveProperty("status", "idle");
      expect(res.body.sessions[0]).toHaveProperty("createdAt");
    });
  });

  describe("POST /api/sessions/:sessionId/abort", () => {
    it("returns 404 for non-existent session", async () => {
      const res = await request(app)
        .post("/api/sessions/nonexistent-id/abort")
        .expect(404);

      expect(res.body).toHaveProperty("error");
    });

    it("returns ok for existing session", async () => {
      const createRes = await request(app)
        .post("/api/sessions/new")
        .send({ cwd: "/tmp/test" });

      const res = await request(app)
        .post(`/api/sessions/${createRes.body.sessionId}/abort`)
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("POST /api/permissions/:id/decide with SessionManager", () => {
    it("calls sessionManager.resolvePermission with the decision", async () => {
      const spy = vi.spyOn(state.sessionManager!, "resolvePermission");

      // The permission ID doesn't exist in either handler, so we get 404,
      // but the spy should still have been called.
      const res = await request(app)
        .post("/api/permissions/test-perm-id/decide")
        .send({ decision: "approved" });

      expect(spy).toHaveBeenCalledWith("test-perm-id", "approved");
      // 404 because neither the polling handler nor SessionManager found this ID
      expect(res.status).toBe(404);
    });
  });

  describe("routes without sessionManager", () => {
    it("POST /sessions/new returns 500 when sessionManager is missing", async () => {
      const appNoManager = createApp({ clients: new Set() } as ServerState);

      const res = await request(appNoManager)
        .post("/api/sessions/new")
        .send({ cwd: "/tmp/test" })
        .expect(500);

      expect(res.body.error).toContain("Session manager");
    });

    it("GET /sessions/active returns empty when sessionManager is missing", async () => {
      const appNoManager = createApp({ clients: new Set() } as ServerState);

      const res = await request(appNoManager)
        .get("/api/sessions/active")
        .expect(200);

      expect(res.body).toEqual({ sessions: [] });
    });
  });
});
