import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { subagentFanoutTool } from "./subagent-fanout.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("subagent_fanout", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("detects Task calls in long.jsonl", async () => {
    const out = (await subagentFanoutTool.handler({ range: "all" })) as {
      data: { items: Array<{ sessionId: string; taskCalls: number }> };
    };
    const longSession = out.data.items.find((i) => i.sessionId === "long");
    expect(longSession).toBeDefined();
    expect(longSession?.taskCalls).toBeGreaterThanOrEqual(1);
  });
});
