import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { longestSessionsTool } from "./longest-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("longest_sessions", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns sessions sorted by duration desc", async () => {
    const out = (await longestSessionsTool.handler({ range: "all", limit: 5 })) as {
      data: { items: Array<{ id: string; durationMs: number }> };
    };
    expect(out.data.items.length).toBeGreaterThan(0);
    // First should have longest duration
    if (out.data.items.length > 1) {
      expect(out.data.items[0]!.durationMs).toBeGreaterThanOrEqual(
        out.data.items[1]!.durationMs,
      );
    }
  });
});
