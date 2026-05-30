import { describe, it, expect } from "vitest";
import { toFlowElements } from "./agentFlowElements";
import type { AgentDAG } from "./types";

const tokens = {
  inputTokens: 10,
  outputTokens: 5,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0.001,
};

const dag = (): AgentDAG => ({
  nodes: [
    { id: "main", type: "main", tokenUsage: tokens, toolCalls: 1, mcpToolCalls: 0, status: "active" },
    { id: "agent_a", type: "engineer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
    { id: "agent_b", type: "reviewer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
  ],
  edges: [
    { source: "main", target: "agent_a" },
    { source: "main", target: "agent_b" },
  ],
});

const positions = (): Map<string, { x: number; y: number }> =>
  new Map([
    ["main", { x: 100, y: 50 }],
    ["agent_a", { x: 0, y: 200 }],
    ["agent_b", { x: 200, y: 200 }],
  ]);

describe("toFlowElements", () => {
  it("produces one flow node per dag node and one edge per dag edge", () => {
    const { nodes, edges } = toFlowElements(dag(), positions(), new Set(), null);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });

  it("maps each node id, type=agent, and embeds the AgentNode in data", () => {
    const { nodes } = toFlowElements(dag(), positions(), new Set(), null);
    const main = nodes.find((n) => n.id === "main");
    expect(main).toBeDefined();
    expect(main?.type).toBe("agent");
    expect(main?.data.node.id).toBe("main");
    expect(main?.data.node.type).toBe("main");
  });

  it("places each node at its position from the positions map", () => {
    const { nodes } = toFlowElements(dag(), positions(), new Set(), null);
    expect(nodes.find((n) => n.id === "agent_a")?.position).toEqual({ x: 0, y: 200 });
    expect(nodes.find((n) => n.id === "agent_b")?.position).toEqual({ x: 200, y: 200 });
  });

  it("falls back to {x:0,y:0} when a node has no position", () => {
    const { nodes } = toFlowElements(dag(), new Map(), new Set(), null);
    expect(nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
  });

  it("sets data.running true only for ids in runningAgentIds", () => {
    const { nodes } = toFlowElements(dag(), positions(), new Set(["main"]), null);
    expect(nodes.find((n) => n.id === "main")?.data.running).toBe(true);
    expect(nodes.find((n) => n.id === "agent_a")?.data.running).toBe(false);
  });

  it("sets both data.selected and node.selected for the selected id only", () => {
    const { nodes } = toFlowElements(dag(), positions(), new Set(), "agent_b");
    const b = nodes.find((n) => n.id === "agent_b");
    const a = nodes.find((n) => n.id === "agent_a");
    expect(b?.data.selected).toBe(true);
    expect(b?.selected).toBe(true);
    expect(a?.data.selected).toBe(false);
    expect(a?.selected).toBe(false);
  });

  it("builds edge ids as `source->target` with source/target wired and type=default", () => {
    const { edges } = toFlowElements(dag(), positions(), new Set(), null);
    const e = edges.find((x) => x.id === "main->agent_a");
    expect(e).toBeDefined();
    expect(e?.source).toBe("main");
    expect(e?.target).toBe("agent_a");
    expect(e?.type).toBe("default");
  });

  it("returns empty arrays for an empty dag", () => {
    const { nodes, edges } = toFlowElements({ nodes: [], edges: [] }, new Map(), new Set(), null);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
