import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit S1 (P1) — double-abort race: res.on("close") aborts the next message.
// Audit S2 (P2) — reject double-submit with 409 before flushing SSE headers.
//
// Node fires the response 'close' event after EVERY res.end(), not only on a
// genuine client disconnect. A deferred 'close' from message A must NOT abort
// message B's fresh AbortController. We prove the close handler only aborts
// when the stream did not complete normally.

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));

vi.mock("../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(),
}));
vi.mock("../../analyzer/metrics.js", () => ({
  computeMetrics: vi.fn(),
}));
vi.mock("../../api/usage-client.js", () => ({
  getAnthropicUsage: vi.fn(),
}));
vi.mock("../../analyzer/cost-aggregator.js", () => ({
  aggregateCosts: vi.fn(),
}));
vi.mock("../../analyzer/agent-events.js", () => ({
  getAgentEvents: vi.fn(),
}));
vi.mock("../../hooks/permission-handler.js", () => ({
  addPermissionRequest: vi.fn(),
  resolvePermissionRequest: vi.fn(),
  getPendingPermissions: vi.fn(() => []),
  getPermissionStatus: vi.fn(),
  addSessionAllowance: vi.fn(),
  getSessionAllowances: vi.fn(() => []),
}));
vi.mock("../../debug/lifecycle-builder.js", () => ({
  buildLifecycleRecords: vi.fn(),
}));
vi.mock("../../cache/model-context-cache.js", () => ({
  updateModelContextWindows: vi.fn(),
}));
vi.mock("../../logger.js", () => ({
  sessionLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  permissionLog: { info: vi.fn(), warn: vi.fn() },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

import request from "supertest";
import express from "express";
import { setupRoutes } from "../routes.js";
import { SessionManager } from "../../session/session-manager.js";

describe("POST /sessions/:sessionId/message — close-abort race (S1)", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../server.js").ServerState;

    app = express();
    app.use(express.json());
    app.use(setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("does NOT call abortSession on the post-end() close when the stream completed normally", async () => {
    const id = await sessionManager.startSession("/tmp");

    // Stream a couple of events then complete normally.
    async function* fakeStream(): AsyncGenerator<unknown> {
      yield { type: "assistant", uuid: "a1" };
      yield { type: "result", uuid: "r1" };
    }
    vi.spyOn(sessionManager, "sendMessage").mockImplementation(() => fakeStream());
    const abortSpy = vi.spyOn(sessionManager, "abortSession");

    // supertest closes the socket after the response ends → fires res 'close'.
    await request(app)
      .post(`/sessions/${id}/message`)
      .send({ prompt: "hello" });

    // The post-end() 'close' must NOT have aborted the session.
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it("calls abortSession when close fires before the stream completes (genuine disconnect)", async () => {
    const id = await sessionManager.startSession("/tmp");

    let abortedDuringStream = false;
    const abortSpy = vi
      .spyOn(sessionManager, "abortSession")
      .mockImplementation(() => {
        abortedDuringStream = true;
        return true;
      });

    // A stream that never completes until aborted — simulate a hung turn.
    async function* hangingStream(): AsyncGenerator<unknown> {
      yield { type: "assistant", uuid: "a1" };
      // Wait until the close handler aborts, then stop.
      for (let i = 0; i < 200 && !abortedDuringStream; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    vi.spyOn(sessionManager, "sendMessage").mockImplementation(() => hangingStream());

    // Abort the request mid-stream by closing the socket.
    await new Promise<void>((resolve) => {
      const req = request(app)
        .post(`/sessions/${id}/message`)
        .send({ prompt: "hello" })
        .end(() => resolve());
      // Force-close shortly after the request starts streaming.
      setTimeout(() => req.abort(), 30);
    });

    // Give the close handler a tick to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(abortSpy).toHaveBeenCalledWith(id);
  });
});

describe("POST /sessions/:sessionId/message — double-submit 409 (S2)", () => {
  let app: express.Express;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(vi.fn());
    const state = {
      clients: new Set(),
      sessionManager,
    } as unknown as import("../server.js").ServerState;

    app = express();
    app.use(express.json());
    app.use(setupRoutes(state));
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  it("returns 409 JSON when the session is already streaming and does NOT abort the live stream", async () => {
    const id = await sessionManager.startSession("/tmp");
    // Simulate an in-flight stream.
    const live = sessionManager.getStatus(id)!;
    live.status = "streaming";
    const liveController = live.abortController;

    const abortSpy = vi.spyOn(sessionManager, "abortSession");
    const sendSpy = vi.spyOn(sessionManager, "sendMessage");

    const res = await request(app)
      .post(`/sessions/${id}/message`)
      .send({ prompt: "second" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Session is already streaming" });
    // The rejected request must not have started a stream...
    expect(sendSpy).not.toHaveBeenCalled();
    // ...and must not have aborted the first, live stream.
    expect(abortSpy).not.toHaveBeenCalled();
    expect(live.abortController).toBe(liveController);
    expect(live.abortController.signal.aborted).toBe(false);
  });

  it("returns 409 JSON when the session is waiting-permission and does NOT abort the live stream (F2)", async () => {
    const id = await sessionManager.startSession("/tmp");
    // The first turn is parked on a permission / AskUserQuestion prompt.
    const live = sessionManager.getStatus(id)!;
    live.status = "waiting-permission";
    const liveController = live.abortController;

    const abortSpy = vi.spyOn(sessionManager, "abortSession");
    const sendSpy = vi.spyOn(sessionManager, "sendMessage");

    const res = await request(app)
      .post(`/sessions/${id}/message`)
      .send({ prompt: "second" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Session is already streaming" });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();
    // The first turn's controller must be untouched (no concurrent-submit race).
    expect(live.abortController).toBe(liveController);
    expect(live.abortController.signal.aborted).toBe(false);
  });
});
