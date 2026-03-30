/**
 * Tests that DAG layout positions are memoized based on structure (node IDs + edges),
 * not on node data changes (token updates, status changes).
 */
import { describe, it, expect } from "vitest";
import type { AgentDAG, AgentNode, AgentEdge } from "../lib/types";
import { computeTreeLayout, getLayoutedElements } from "./AgentFlowDAG";

function makeNode(id: string, type: string, overrides?: Partial<AgentNode>): AgentNode {
  return {
    id,
    type,
    description: `${type} agent`,
    tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0.01 },
    toolCalls: 5,
    mcpToolCalls: 0,
    status: "completed",
    startTime: "2026-03-24T10:00:00Z",
    endTime: "2026-03-24T10:05:00Z",
    ...overrides,
  };
}

describe("AgentFlowDAG layout memoization", () => {
  it("computeTreeLayout returns identical positions for same structure with different node data", () => {
    const dag1: AgentDAG = {
      nodes: [makeNode("main", "main"), makeNode("a1", "engineer")],
      edges: [{ source: "main", target: "a1" }],
    };
    // Same structure, different token data
    const dag2: AgentDAG = {
      nodes: [
        makeNode("main", "main", { tokenUsage: { inputTokens: 999, outputTokens: 999, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 99 } }),
        makeNode("a1", "engineer", { status: "active", toolCalls: 100 }),
      ],
      edges: [{ source: "main", target: "a1" }],
    };

    const pos1 = computeTreeLayout(dag1.nodes, dag1.edges);
    const pos2 = computeTreeLayout(dag2.nodes, dag2.edges);

    // Positions should be identical since structure is the same
    expect(pos1.get("main")).toEqual(pos2.get("main"));
    expect(pos1.get("a1")).toEqual(pos2.get("a1"));
  });

  it("getLayoutedElements produces different node.data when selectedAgent changes", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "main"), makeNode("a1", "engineer")],
      edges: [{ source: "main", target: "a1" }],
    };

    const r1 = getLayoutedElements(dag, null);
    const r2 = getLayoutedElements(dag, "a1");

    // Node positions should be the same
    expect(r1.nodes[0].position).toEqual(r2.nodes[0].position);
    expect(r1.nodes[1].position).toEqual(r2.nodes[1].position);

    // But selected state should differ
    expect(r1.nodes[1].data.selected).toBe(false);
    expect(r2.nodes[1].data.selected).toBe(true);
  });
});
