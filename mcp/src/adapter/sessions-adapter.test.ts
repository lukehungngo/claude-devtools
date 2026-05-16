import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listSessions } from "./sessions-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("listSessions", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns all sessions from fixture dir", () => {
    const out = listSessions({ range: "all" });
    expect(out.length).toBe(5);
  });

  it("filters by range using file mtime", () => {
    // Files were just created, so mtime is now — they all pass the 24h filter
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
