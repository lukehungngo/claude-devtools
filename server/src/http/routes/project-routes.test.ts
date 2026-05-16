import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the route module
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

// Mock session-discovery so we can drive the hash → path resolver
vi.mock("../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(),
}));

import request from "supertest";
import express from "express";
import { json } from "express";
import { spawnSync } from "node:child_process";
import { createProjectRoutes } from "./project-routes.js";
import { discoverSessions } from "../../parser/session-discovery.js";

const mockedSpawn = vi.mocked(spawnSync);
const mockedDiscover = vi.mocked(discoverSessions);

function buildApp() {
  const app = express();
  app.use(json());
  app.use(createProjectRoutes());
  return app;
}

function sessionFor(projectHash: string, cwd: string) {
  return {
    id: "abc",
    projectHash,
    path: "/p/abc.jsonl",
    startTime: "2026-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:00:00Z",
    eventCount: 1,
    subagentCount: 0,
    cwd,
    isActive: false,
    isRunning: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /projects/:hash/purge/dry-run", () => {
  it("spawns `claude project purge --dry-run -y <path>` and returns parsed files", async () => {
    mockedDiscover.mockReturnValue([
      sessionFor("h1", "/Users/me/proj"),
    ] as never);
    mockedSpawn.mockReturnValue({
      status: 0,
      stdout: Buffer.from("Would delete: /a/b.jsonl\nWould delete: /a/c.jsonl\n"),
      stderr: Buffer.from(""),
      pid: 0,
      output: [],
      signal: null,
    } as never);

    const res = await request(buildApp()).post("/projects/h1/purge/dry-run").send({});
    expect(res.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "claude",
      ["project", "purge", "--dry-run", "-y", "/Users/me/proj"],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(res.body.files).toEqual(["/a/b.jsonl", "/a/c.jsonl"]);
    expect(res.body.exitCode).toBe(0);
    expect(res.body.rawStdout).toContain("Would delete");
  });

  it("returns 404 when the project hash is unknown", async () => {
    mockedDiscover.mockReturnValue([] as never);
    const res = await request(buildApp())
      .post("/projects/unknown/purge/dry-run")
      .send({});
    expect(res.status).toBe(404);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("returns 500 with stderr when claude CLI is missing (ENOENT)", async () => {
    mockedDiscover.mockReturnValue([
      sessionFor("h1", "/Users/me/proj"),
    ] as never);
    mockedSpawn.mockReturnValue({
      status: null,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      pid: 0,
      output: [],
      signal: null,
      error: Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }),
    } as never);

    const res = await request(buildApp()).post("/projects/h1/purge/dry-run").send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/claude/i);
  });
});

describe("POST /projects/:hash/purge", () => {
  it("requires { confirm: true } in body — 400 otherwise", async () => {
    mockedDiscover.mockReturnValue([
      sessionFor("h1", "/Users/me/proj"),
    ] as never);

    const res = await request(buildApp()).post("/projects/h1/purge").send({});
    expect(res.status).toBe(400);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("spawns `claude project purge -y <path>` when confirmed", async () => {
    mockedDiscover.mockReturnValue([
      sessionFor("h1", "/Users/me/proj"),
    ] as never);
    mockedSpawn.mockReturnValue({
      status: 0,
      stdout: Buffer.from("Purged 3 files\n"),
      stderr: Buffer.from(""),
      pid: 0,
      output: [],
      signal: null,
    } as never);

    const res = await request(buildApp())
      .post("/projects/h1/purge")
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "claude",
      ["project", "purge", "-y", "/Users/me/proj"],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(res.body.ok).toBe(true);
    expect(res.body.exitCode).toBe(0);
  });

  it("returns 404 when the project hash is unknown", async () => {
    mockedDiscover.mockReturnValue([] as never);
    const res = await request(buildApp())
      .post("/projects/unknown/purge")
      .send({ confirm: true });
    expect(res.status).toBe(404);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("returns ok=false with non-zero exitCode when CLI exits non-zero", async () => {
    mockedDiscover.mockReturnValue([
      sessionFor("h1", "/Users/me/proj"),
    ] as never);
    mockedSpawn.mockReturnValue({
      status: 2,
      stdout: Buffer.from(""),
      stderr: Buffer.from("not authorized\n"),
      pid: 0,
      output: [],
      signal: null,
    } as never);

    const res = await request(buildApp())
      .post("/projects/h1/purge")
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.exitCode).toBe(2);
    expect(res.body.stderr).toContain("not authorized");
  });
});
