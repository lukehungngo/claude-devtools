import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tokenTimelineTool } from "./token-timeline.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("token_timeline", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns points for a known session", async () => {
    const out = (await tokenTimelineTool.handler({ session_id: "medium" })) as {
      data: { id: string; points: Array<{ t: string; cumulativeCost: number }> };
    };
    expect(out.data.id).toBe("medium");
    expect(out.data.points.length).toBeGreaterThan(0);
    // Cumulative cost should increase
    const lastPoint = out.data.points[out.data.points.length - 1];
    expect(lastPoint?.cumulativeCost).toBeGreaterThan(0);
  });
});
