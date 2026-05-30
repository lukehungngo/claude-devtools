import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSessions } from "./sessions-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("listSessions", () => {
  const origEnv = { ...process.env };
  let tempFixtureDir: string;

  beforeEach(() => {
    tempFixtureDir = mkdtempSync(join(tmpdir(), "claude-devtools-mcp-sessions-"));
    cpSync(FIXTURE_DIR, tempFixtureDir, { recursive: true });
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = tempFixtureDir;
  });
  afterEach(() => {
    process.env = origEnv;
    rmSync(tempFixtureDir, { recursive: true, force: true });
  });

  it("returns all sessions from fixture dir", () => {
    const out = listSessions({ range: "all" });
    expect(out.length).toBe(5);
  });

  it("filters by range using file mtime", () => {
    // Files were copied into a temp fixture dir, so mtime is now.
    const out = listSessions({ range: "24h" });
    expect(out.length).toBe(5);
  });

  it("returns sessions with expected fields", () => {
    const out = listSessions({ range: "all" });
    const first = out[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("projectHash");
    expect(first).toHaveProperty("path");
    expect(first).toHaveProperty("lastModified");
    expect(first).toHaveProperty("eventCount");
  });

  it("filters by project hash", () => {
    const out = listSessions({ range: "all", project: "nonexistent" });
    expect(out).toEqual([]);
  });

  it("respects limit", () => {
    const out = listSessions({ range: "all", limit: 2 });
    expect(out.length).toBe(2);
  });
});
