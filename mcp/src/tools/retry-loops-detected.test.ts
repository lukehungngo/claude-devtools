import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { retryLoopsDetectedTool } from "./retry-loops-detected.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("retry_loops_detected", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("detects the 3x npm test retry in long.jsonl", async () => {
    const out = (await retryLoopsDetectedTool.handler({ range: "all" })) as {
      data: { items: Array<{ sessionId: string; tool: string; count: number }> };
    };
    const npmRetry = out.data.items.find(
      (i) => i.sessionId === "long" && i.tool === "Bash",
    );
    expect(npmRetry).toBeDefined();
    expect(npmRetry?.count).toBeGreaterThanOrEqual(3);
  });
});
