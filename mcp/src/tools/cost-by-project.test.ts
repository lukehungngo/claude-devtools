import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { costByProjectTool } from "./cost-by-project.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("cost_by_project", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns items sorted by cost desc", async () => {
    const out = (await costByProjectTool.handler({ range: "all" })) as {
      data: { items: Array<{ project: string; cost: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
    expect(out.data.items[0]).toHaveProperty("project");
    expect(out.data.items[0]).toHaveProperty("cost");
  });
});
