import { describe, it, expect } from "vitest";
import { forceGraphLayout } from "./forceGraphLayout";
import type { AgentDAG, AgentNode } from "./types";

const node = (id: string, parentId?: string): AgentNode => ({
  id,
  type: id === "main" ? "main" : "subagent",
  parentId,
  tokenUsage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
  toolCalls: 0,
  mcpToolCalls: 0,
  status: "completed",
});

const OPTS = { nodeW: 240, nodeH: 112, pad: 32, iterations: 200 };

describe("forceGraphLayout", () => {
  it("centers a single node and sizes the canvas to one card + padding", () => {
    const dag: AgentDAG = { nodes: [node("main")], edges: [] };
    const out = forceGraphLayout(dag, OPTS);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]).toMatchObject({ id: "main", cx: 32 + 120, cy: 32 + 56 });
    expect(out.width).toBe(240 + 64);
    expect(out.height).toBe(112 + 64);
  });

  it("assigns a unique position to every node (no overlap of centers)", () => {
    const dag: AgentDAG = {
      nodes: [node("main"), node("a", "main"), node("b", "main"), node("c", "a")],
      edges: [
        { source: "main", target: "a" },
        { source: "main", target: "b" },
        { source: "a", target: "c" },
      ],
    };
    const out = forceGraphLayout(dag, OPTS);
    expect(out.nodes).toHaveLength(4);
    const coords = new Set(out.nodes.map((n) => `${Math.round(n.cx)},${Math.round(n.cy)}`));
    expect(coords.size).toBe(4);
    expect(out.edges).toEqual(dag.edges);
  });

  it("is NOT a layered tree — children are not all stacked one row below the parent", () => {
    const dag: AgentDAG = {
      nodes: [node("main"), node("a", "main"), node("b", "main")],
      edges: [
        { source: "main", target: "a" },
        { source: "main", target: "b" },
      ],
    };
    const out = forceGraphLayout(dag, OPTS);
    const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    // In a force graph the two children do not share an identical y (as a tree row would),
    // and they spread in 2D around the parent.
    const sameRow = Math.abs(byId.a.cy - byId.b.cy) < 1 && byId.a.cy > byId.main.cy;
    expect(sameRow).toBe(false);
  });

  it("is deterministic — identical input yields identical output", () => {
    const dag: AgentDAG = {
      nodes: [node("main"), node("a", "main"), node("b", "main")],
      edges: [{ source: "main", target: "a" }, { source: "main", target: "b" }],
    };
    const a = forceGraphLayout(dag, OPTS);
    const b = forceGraphLayout(dag, OPTS);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it("keeps all node centers within the reported canvas bounds", () => {
    const dag: AgentDAG = {
      nodes: ["main", "a", "b", "c", "d"].map((id) => node(id, id === "main" ? undefined : "main")),
      edges: ["a", "b", "c", "d"].map((t) => ({ source: "main", target: t })),
    };
    const out = forceGraphLayout(dag, OPTS);
    for (const n of out.nodes) {
      expect(n.cx).toBeGreaterThanOrEqual(0);
      expect(n.cx).toBeLessThanOrEqual(out.width);
      expect(n.cy).toBeGreaterThanOrEqual(0);
      expect(n.cy).toBeLessThanOrEqual(out.height);
    }
  });
});
