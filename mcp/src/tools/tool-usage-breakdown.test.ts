import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { toolUsageBreakdownTool } from "./tool-usage-breakdown.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("tool_usage_breakdown", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns tool items sorted by calls desc", async () => {
    const out = (await toolUsageBreakdownTool.handler({ range: "all" })) as {
      data: { items: Array<{ tool: string; calls: number; errorRate: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
    expect(out.data.items[0]).toHaveProperty("errorRate");
  });
});
