import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cacheHitTrendsTool } from "./cache-hit-trends.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("cache_hit_trends", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns buckets with hitRate", async () => {
    const out = (await cacheHitTrendsTool.handler({ range: "all" })) as {
      data: { buckets: Array<{ day: string; hitRate: number }> };
    };
    expect(out.data.buckets.length).toBeGreaterThan(0);
    expect(out.data.buckets[0]).toHaveProperty("hitRate");
  });
});
