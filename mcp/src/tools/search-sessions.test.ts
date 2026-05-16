import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchSessionsTool } from "./search-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("search_sessions", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns sessions containing the query string", async () => {
    const out = (await searchSessionsTool.handler({
      query: "bug",
      range: "all",
    })) as { data: { items: unknown[] } };
    expect(out.data).toHaveProperty("items");
  });

  it("limits query length", async () => {
    await expect(
      searchSessionsTool.handler({ query: "x".repeat(2000), range: "all" }),
    ).rejects.toThrow(/INVALID_ARGS/);
  });
});
