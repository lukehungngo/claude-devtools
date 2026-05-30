import { describe, it, expect } from "vitest";
import { summarizeDag } from "./graphSummary";
import type { AgentDAG, AgentNode } from "./types";

const tokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
};

function node(id: string, type: string, status: AgentNode["status"]): AgentNode {
  return { id, type, tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status };
}

const dag: AgentDAG = {
  nodes: [
    node("main", "main", "active"),
    node("a1", "engineer", "completed"),
    node("a2", "engineer", "completed"),
    node("a3", "reviewer", "error"),
    node("a4", "general-purpose", "active"),
  ],
  edges: [],
};

describe("summarizeDag", () => {
  it("counts total, running, and finished from runningAgentIds (not node.status)", () => {
    const running = new Set(["main", "a4"]);
    const s = summarizeDag(dag, running);
    expect(s.total).toBe(5);
    expect(s.running).toBe(2);
    // a3 is a non-running error node → counted as errored, not finished
    expect(s.errored).toBe(1);
    expect(s.finished).toBe(2);
  });

  it("surfaces non-running error nodes as errored (not hidden in finished)", () => {
    const running = new Set(["main"]);
    const s = summarizeDag(dag, running);
    expect(s.running).toBe(1);
    expect(s.errored).toBe(1); // a3 (reviewer, error)
    // a1, a2 completed + a4 active-but-not-running → 3 finished
    expect(s.finished).toBe(3);
  });

  it("groups byType, sorted by count desc then type asc", () => {
    const s = summarizeDag(dag, new Set(["main"]));
    expect(s.byType).toEqual([
      { type: "engineer", count: 2 },
      { type: "general-purpose", count: 1 },
      { type: "main", count: 1 },
      { type: "reviewer", count: 1 },
    ]);
  });

  it("handles an empty dag", () => {
    const s = summarizeDag({ nodes: [], edges: [] }, new Set());
    expect(s).toEqual({ total: 0, running: 0, errored: 0, finished: 0, byType: [] });
  });

  it("ignores runningAgentIds that are not present as nodes", () => {
    const s = summarizeDag(dag, new Set(["main", "ghost"]));
    expect(s.running).toBe(1);
    expect(s.errored).toBe(1);
    expect(s.finished).toBe(3);
  });
});
