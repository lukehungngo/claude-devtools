/**
 * Tests the custom tree layout that wraps children into rows of max 3.
 * Verifies: valid positions, no overlaps, row wrapping, multi-level trees.
 */
import { describe, it, expect } from "vitest";
import type { AgentDAG, AgentNode, AgentEdge } from "../lib/types";
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT, H_GAP, V_GAP, MAX_PER_ROW } from "./AgentFlowDAG";

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
  const positions = computeTreeLayout(dag.nodes, dag.edges);
  return dag.nodes.map((n) => {
    const pos = positions.get(n.id) || { x: 0, y: 0 };
    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      valid: Number.isFinite(pos.x) && Number.isFinite(pos.y),
    };
  });
}

/** Check that no two nodes overlap (bounding boxes don't intersect) */
function assertNoOverlaps(positions: Array<{ id: string; x: number; y: number }>) {
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const overlapX = a.x < b.x + NODE_WIDTH && a.x + NODE_WIDTH > b.x;
      const overlapY = a.y < b.y + NODE_HEIGHT && a.y + NODE_HEIGHT > b.y;
      expect(
        overlapX && overlapY,
        `Nodes ${a.id} (${a.x},${a.y}) and ${b.id} (${b.x},${b.y}) overlap`
      ).toBe(false);
    }
  }
}

describe("AgentFlowDAG custom tree layout", () => {
  it("positions main node with valid coordinates when alone", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "main")],
      edges: [],
    };
    const positions = layoutNodes(dag);
    expect(positions).toHaveLength(1);
    expect(positions[0].valid).toBe(true);
  });

  it("positions main above single child", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "main"), makeNode("a1", "engineer")],
      edges: [{ source: "main", target: "a1" }],
    };
    const positions = layoutNodes(dag);
    const main = positions.find((p) => p.id === "main")!;
    const child = positions.find((p) => p.id === "a1")!;
    expect(main.y).toBeLessThan(child.y);
  });

  it("places 3 children in one row (max per row)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("a1", "engineer"),
        makeNode("a2", "engineer"),
        makeNode("a3", "engineer"),
      ],
      edges: [
        { source: "main", target: "a1" },
        { source: "main", target: "a2" },
        { source: "main", target: "a3" },
      ],
    };
    const positions = layoutNodes(dag);
    const children = positions.filter((p) => p.id !== "main");

    // All 3 children should be at the same Y
    expect(children[0].y).toBe(children[1].y);
    expect(children[1].y).toBe(children[2].y);

    // All should be below main
    const main = positions.find((p) => p.id === "main")!;
    for (const c of children) {
      expect(main.y).toBeLessThan(c.y);
    }

    assertNoOverlaps(positions);
  });

  it("wraps 5 children into 2 rows (3 + 2)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("a1", "engineer"),
        makeNode("a2", "engineer"),
        makeNode("a3", "engineer"),
        makeNode("a4", "reviewer"),
        makeNode("a5", "reviewer"),
      ],
      edges: [
        { source: "main", target: "a1" },
        { source: "main", target: "a2" },
        { source: "main", target: "a3" },
        { source: "main", target: "a4" },
        { source: "main", target: "a5" },
      ],
    };
    const positions = layoutNodes(dag);
    const children = positions.filter((p) => p.id !== "main");

    // First 3 should be in row 1 (same Y)
    expect(children[0].y).toBe(children[1].y);
    expect(children[1].y).toBe(children[2].y);

    // Last 2 should be in row 2 (same Y, greater than row 1)
    expect(children[3].y).toBe(children[4].y);
    expect(children[3].y).toBeGreaterThan(children[0].y);

    assertNoOverlaps(positions);
  });

  it("wraps 8 children into 3 rows (3 + 3 + 2)", () => {
    const nodes = [makeNode("main", "main")];
    const edges: AgentEdge[] = [];
    for (let i = 1; i <= 8; i++) {
      nodes.push(makeNode(`a${i}`, "engineer"));
      edges.push({ source: "main", target: `a${i}` });
    }
    const dag: AgentDAG = { nodes, edges };
    const positions = layoutNodes(dag);
    const children = positions.filter((p) => p.id !== "main");

    // Row 1: a1, a2, a3
    expect(children[0].y).toBe(children[1].y);
    expect(children[1].y).toBe(children[2].y);

    // Row 2: a4, a5, a6
    expect(children[3].y).toBe(children[4].y);
    expect(children[4].y).toBe(children[5].y);
    expect(children[3].y).toBeGreaterThan(children[2].y);

    // Row 3: a7, a8
    expect(children[6].y).toBe(children[7].y);
    expect(children[6].y).toBeGreaterThan(children[5].y);

    assertNoOverlaps(positions);
  });

  it("handles multi-level tree (main → A → B, C)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("orch", "orchestrator"),
        makeNode("eng1", "engineer"),
        makeNode("eng2", "engineer"),
      ],
      edges: [
        { source: "main", target: "orch" },
        { source: "orch", target: "eng1" },
        { source: "orch", target: "eng2" },
      ],
    };
    const positions = layoutNodes(dag);

    const main = positions.find((p) => p.id === "main")!;
    const orch = positions.find((p) => p.id === "orch")!;
    const eng1 = positions.find((p) => p.id === "eng1")!;
    const eng2 = positions.find((p) => p.id === "eng2")!;

    // Hierarchy: main above orch, orch above engineers
    expect(main.y).toBeLessThan(orch.y);
    expect(orch.y).toBeLessThan(eng1.y);
    expect(eng1.y).toBe(eng2.y);

    assertNoOverlaps(positions);
  });

  it("no overlaps with mixed fan-out (main → 4 children, child1 → 2 grandchildren)", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode("main", "main"),
        makeNode("a1", "orchestrator"),
        makeNode("a2", "engineer"),
        makeNode("a3", "engineer"),
        makeNode("a4", "reviewer"),
        makeNode("g1", "researcher"),
        makeNode("g2", "researcher"),
      ],
      edges: [
        { source: "main", target: "a1" },
        { source: "main", target: "a2" },
        { source: "main", target: "a3" },
        { source: "main", target: "a4" },
        { source: "a1", target: "g1" },
        { source: "a1", target: "g2" },
      ],
    };
    const positions = layoutNodes(dag);
    assertNoOverlaps(positions);

    // All positions should be valid
    for (const pos of positions) {
      expect(pos.valid).toBe(true);
    }
  });

  it("returns empty map for empty DAG", () => {
    const positions = computeTreeLayout([], []);
    expect(positions.size).toBe(0);
  });

  it("all nodes get unique positions", () => {
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
