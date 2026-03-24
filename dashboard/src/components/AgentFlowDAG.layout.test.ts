/**
 * Tests that the dagre layout produces valid positions for ALL nodes,
 * including the main node. Reproduces the bug where the main node
 * is present in data (legend + stats) but missing from the graph.
 */
import { describe, it, expect } from "vitest";
import dagre from "@dagrejs/dagre";
import type { AgentDAG, AgentNode } from "../lib/types";

const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;

function makeNode(id: string, type: string): AgentNode {
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
  };
}

function layoutNodes(dag: AgentDAG) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  for (const node of dag.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of dag.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return dag.nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      x: pos.x - NODE_WIDTH / 2,
      y: pos.y - NODE_HEIGHT / 2,
      valid: Number.isFinite(pos.x) && Number.isFinite(pos.y),
    };
  });
}

describe("AgentFlowDAG layout", () => {
  it("positions all 5 nodes with valid coordinates (main + 4 children)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("agent-1", "Explore"),
        makeNode("agent-2", "Explore"),
        makeNode("agent-3", "Explore"),
        makeNode("agent-4", "differential-reviewer"),
      ],
      edges: [
        { source: "main", target: "agent-1" },
        { source: "main", target: "agent-2" },
        { source: "main", target: "agent-3" },
        { source: "main", target: "agent-4" },
      ],
    };

    const positions = layoutNodes(dag);

    // All nodes must have valid (non-NaN, finite) positions
    for (const pos of positions) {
      expect(pos.valid, `Node ${pos.id} has invalid position: (${pos.x}, ${pos.y})`).toBe(true);
    }

    // Main node must exist in layout
    const mainPos = positions.find((p) => p.id === "main");
    expect(mainPos).toBeDefined();

    // Main node should be ABOVE children (smaller y = higher in TB layout)
    const childPositions = positions.filter((p) => p.id !== "main");
    for (const child of childPositions) {
      expect(mainPos!.y).toBeLessThan(child.y);
    }
  });

  it("positions main node with valid coordinates even with no children", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "main")],
      edges: [],
    };

    const positions = layoutNodes(dag);
    expect(positions).toHaveLength(1);
    expect(positions[0].valid).toBe(true);
  });

  it("all nodes get unique positions (no overlapping)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("a1", "Explore"),
        makeNode("a2", "Explore"),
      ],
      edges: [
        { source: "main", target: "a1" },
        { source: "main", target: "a2" },
      ],
    };

    const positions = layoutNodes(dag);
    const posKeys = positions.map((p) => `${p.x},${p.y}`);
    const uniqueKeys = new Set(posKeys);
    expect(uniqueKeys.size).toBe(positions.length);
  });
});
