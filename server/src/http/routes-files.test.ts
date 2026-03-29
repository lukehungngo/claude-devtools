import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupRoutes } from "./routes.js";
import express from "express";
import request from "supertest";

/**
 * Tests for GET /api/sessions/:projectHash/:sessionId/files
 *
 * Verifies:
 * - Returns file list matching a prefix within session cwd
 * - Excludes node_modules, .git, and other ignored dirs
 * - Limits results to 20
 * - Returns 404 when session not found
 * - Returns empty array for non-existent prefix
 */

// Mock session-discovery to control which sessions exist
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => [
    {
      id: "sess-1",
      projectHash: "hash-1",
      cwd: "/tmp/test-project",
      model: "claude-sonnet-4-20250514",
      startTime: "2026-01-01T00:00:00Z",
      path: "/tmp/sessions/sess-1.jsonl",
    },
  ]),
  discoverRepoGroups: vi.fn(() => []),
  loadFullSession: vi.fn(() => ({
    mainEvents: [],
    subagentEvents: new Map(),
    subagentMeta: new Map(),
  })),
}));

// Mock fs to avoid needing real filesystem
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: vi.fn(() => []),
    statSync: vi.fn((p: string) => {
      // Default: return a valid directory stat for any path
      if (p === "/tmp/test-project" || p.startsWith("/tmp/test-project/")) {
        return { isDirectory: (): boolean => true };
      }
      return actual.statSync(p);
    }),
    existsSync: vi.fn((p: string) => {
      if (p === "/tmp/test-project") return true;
      return actual.existsSync(p as string);
    }),
  };
});

import * as fs from "node:fs";

function buildApp() {
  const app = express();
  app.use("/api", setupRoutes());
  return app;
}

describe("GET /api/sessions/:projectHash/:sessionId/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when session is not found", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/no-hash/no-session/files?prefix="
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Session not found");
  });

  it("returns empty files array when cwd does not exist", async () => {
    // Override existsSync for this test
    vi.mocked(fs.existsSync).mockImplementation(() => false);

    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/hash-1/sess-1/files?prefix="
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: [] });
  });

  it("returns file list for valid session and empty prefix", async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => true);
    vi.mocked(fs.readdirSync).mockImplementation(
      () =>
        [
          { name: "src", isDirectory: () => true, isFile: () => false },
          { name: "package.json", isDirectory: () => false, isFile: () => true },
          { name: "README.md", isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fs.readdirSync>
    );

    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/hash-1/sess-1/files?prefix="
    );
    expect(res.status).toBe(200);
    expect(res.body.files).toEqual(
      expect.arrayContaining(["src/", "package.json", "README.md"])
    );
  });

  it("excludes node_modules and .git from results", async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => true);
    vi.mocked(fs.readdirSync).mockImplementation(
      () =>
        [
          { name: "src", isDirectory: () => true, isFile: () => false },
          { name: "node_modules", isDirectory: () => true, isFile: () => false },
          { name: ".git", isDirectory: () => true, isFile: () => false },
          { name: "index.ts", isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fs.readdirSync>
    );

    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/hash-1/sess-1/files?prefix="
    );
    expect(res.status).toBe(200);
    expect(res.body.files).not.toContain("node_modules/");
    expect(res.body.files).not.toContain(".git/");
    expect(res.body.files).toContain("src/");
    expect(res.body.files).toContain("index.ts");
  });

  it("limits results to 20 entries", async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => true);
    const manyEntries = Array.from({ length: 30 }, (_, i) => ({
      name: `file-${i}.ts`,
      isDirectory: () => false,
      isFile: () => true,
    }));
    vi.mocked(fs.readdirSync).mockImplementation(
      () => manyEntries as unknown as ReturnType<typeof fs.readdirSync>
    );

    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/hash-1/sess-1/files?prefix="
    );
    expect(res.status).toBe(200);
    expect(res.body.files.length).toBeLessThanOrEqual(20);
  });

  it("filters by prefix for nested paths", async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => true);
    // When prefix is "src/comp", should read "src/" dir and filter by "comp"
    vi.mocked(fs.readdirSync).mockImplementation(
      () =>
        [
          { name: "components", isDirectory: () => true, isFile: () => false },
          { name: "contexts", isDirectory: () => true, isFile: () => false },
          { name: "config.ts", isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fs.readdirSync>
    );

    const app = buildApp();
    const res = await request(app).get(
      "/api/sessions/hash-1/sess-1/files?prefix=src/comp"
    );
    expect(res.status).toBe(200);
    // Should match "components" and "config.ts" does not match "comp" prefix
    // "contexts" does not match "comp" prefix
    expect(res.body.files).toContain("src/components/");
    expect(res.body.files).not.toContain("src/contexts/");
    expect(res.body.files).not.toContain("src/config.ts");
  });
});
