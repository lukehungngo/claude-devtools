import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { usageSummaryTool } from "./usage-summary.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("usage_summary", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("groups by day", async () => {
    const out = (await usageSummaryTool.handler({
      range: "all",
      group_by: "day",
    })) as { data: { buckets: unknown[] } };
    expect(out.data).toHaveProperty("buckets");
    expect(Array.isArray(out.data.buckets)).toBe(true);
  });

  it("groups by model", async () => {
    const out = (await usageSummaryTool.handler({
      range: "all",
      group_by: "model",
    })) as { data: { buckets: unknown[] } };
    expect(out.data.buckets.length).toBeGreaterThan(0);
  });
});
