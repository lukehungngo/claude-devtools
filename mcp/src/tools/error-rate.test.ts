import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { errorRateTool } from "./error-rate.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("error_rate", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("groups by tool and finds errors in long.jsonl", async () => {
    const out = (await errorRateTool.handler({ range: "all", group_by: "tool" })) as {
      data: { items: Array<{ key: string; totalCalls: number; errors: number; rate: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
    const bash = out.data.items.find((i) => i.key === "Bash");
    expect(bash).toBeDefined();
    expect(bash?.errors).toBeGreaterThan(0);
  });

  it("groups by project", async () => {
    const out = (await errorRateTool.handler({ range: "all", group_by: "project" })) as {
      data: { items: Array<{ key: string; rate: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
  });
});
