import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unfinishedSessionsTool } from "./unfinished-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("unfinished_sessions", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("detects unfinished.jsonl (no end_turn, stale timestamps)", async () => {
    const out = (await unfinishedSessionsTool.handler({ range: "all" })) as {
      data: { items: Array<{ id: string; staleSinceMs: number }> };
    };
    const unfinished = out.data.items.find((i) => i.id === "unfinished");
    expect(unfinished).toBeDefined();
    expect(unfinished?.staleSinceMs).toBeGreaterThan(STALE_THRESHOLD_MS);
  });

  it("does not include sessions with end_turn", async () => {
    const out = (await unfinishedSessionsTool.handler({ range: "all" })) as {
      data: { items: Array<{ id: string }> };
    };
    const medium = out.data.items.find((i) => i.id === "medium");
    expect(medium).toBeUndefined();
  });
});

const STALE_THRESHOLD_MS = 30 * 60 * 1000;
