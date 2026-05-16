import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listSessionsTool } from "./list-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("list_sessions", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns items array", async () => {
    const out = await listSessionsTool.handler({ range: "all", limit: 10 });
    expect(out).toHaveProperty("data");
    const data = (out as { data: { items: unknown[] } }).data;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("rejects invalid range", async () => {
    await expect(
      listSessionsTool.handler({ range: "bogus" }),
    ).rejects.toThrow(/INVALID_ARGS/);
  });
});
