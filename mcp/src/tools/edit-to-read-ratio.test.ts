import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { editToReadRatioTool } from "./edit-to-read-ratio.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("edit_to_read_ratio", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("computes ratio from medium fixture (2 reads before edits, 1 write without)", async () => {
    const out = (await editToReadRatioTool.handler({ range: "all" })) as {
      data: { totalEdits: number; editsPrecededByRead: number; ratio: number };
    };
    // medium.jsonl: 2 Edits preceded by Read, 1 Write without Read, plus long.jsonl: 1 Edit without Read
    expect(out.data.totalEdits).toBeGreaterThan(0);
    expect(out.data.ratio).toBeGreaterThan(0);
    expect(out.data.ratio).toBeLessThanOrEqual(1);
  });
});
