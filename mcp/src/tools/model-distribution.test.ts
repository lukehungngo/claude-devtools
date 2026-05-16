import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { modelDistributionTool } from "./model-distribution.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("model_distribution", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns model items with pct", async () => {
    const out = (await modelDistributionTool.handler({ range: "all" })) as {
      data: { items: Array<{ model: string; pct: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
    expect(out.data.items[0]).toHaveProperty("pct");
  });
});
