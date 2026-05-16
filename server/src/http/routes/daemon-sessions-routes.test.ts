import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parser/daemon-session-discovery.js", () => ({
  listDaemonSessions: vi.fn(),
  findDaemonSessionByPid: vi.fn(),
}));

import request from "supertest";
import express from "express";
import { json } from "express";
import { createDaemonSessionsRoutes } from "./daemon-sessions-routes.js";
import {
  listDaemonSessions,
  findDaemonSessionByPid,
  type DaemonSession,
} from "../../parser/daemon-session-discovery.js";

const mockedList = vi.mocked(listDaemonSessions);
const mockedFind = vi.mocked(findDaemonSessionByPid);

function buildApp() {
  const app = express();
  app.use(json());
  app.use(createDaemonSessionsRoutes());
  return app;
}

function sample(overrides: Partial<DaemonSession> = {}): DaemonSession {
  return {
    pid: 1234,
    sessionId: "sess-x",
    cwd: "/tmp/x",
    startedAt: 1_000,
    version: "2.1.143",
    alive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/daemon-sessions", () => {
  it("returns { sessions } from listDaemonSessions()", async () => {
    mockedList.mockReturnValue([
      sample({ pid: 1, sessionId: "a" }),
      sample({ pid: 2, sessionId: "b", alive: false }),
    ]);

    const res = await request(buildApp()).get("/api/daemon-sessions");
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions[0]).toMatchObject({
      pid: 1,
      sessionId: "a",
      alive: true,
    });
    expect(res.body.sessions[1]).toMatchObject({ pid: 2, alive: false });
  });

  it("returns { sessions: [] } when no daemons are running", async () => {
    mockedList.mockReturnValue([]);
    const res = await request(buildApp()).get("/api/daemon-sessions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessions: [] });
  });
});

describe("GET /api/daemon-sessions/:pid", () => {
  it("returns { session } when the pid matches a daemon", async () => {
    mockedFind.mockReturnValue(sample({ pid: 7777, sessionId: "found" }));

    const res = await request(buildApp()).get("/api/daemon-sessions/7777");
    expect(res.status).toBe(200);
    expect(mockedFind).toHaveBeenCalledWith(7777);
    expect(res.body.session).toMatchObject({ pid: 7777, sessionId: "found" });
  });

  it("returns { session: null } when no daemon matches the pid", async () => {
    mockedFind.mockReturnValue(null);
    const res = await request(buildApp()).get("/api/daemon-sessions/424242");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: null });
  });

  it("returns 400 for a non-numeric pid", async () => {
    const res = await request(buildApp()).get("/api/daemon-sessions/abc");
    expect(res.status).toBe(400);
    expect(mockedFind).not.toHaveBeenCalled();
  });

  it("returns 400 for pid <= 0", async () => {
    const res = await request(buildApp()).get("/api/daemon-sessions/0");
    expect(res.status).toBe(400);
    expect(mockedFind).not.toHaveBeenCalled();
  });
});
