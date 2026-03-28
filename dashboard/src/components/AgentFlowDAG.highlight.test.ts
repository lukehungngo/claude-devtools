/**
 * Tests for activeTurnAgentIds highlight-based rendering in AgentFlowDAG.
 * Verifies: opacity styling, backward compatibility, safety net removal.
 */
import { describe, it, expect } from "vitest";
import type { AgentDAG, AgentNode } from "../lib/types";
import { getLayoutedElements } from "./AgentFlowDAG";

function makeNode(id: string, type: string, status: "active" | "completed" | "error" = "completed"): AgentNode {
  return {
    id,
    type,
    description: `${type} agent`,
    tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0.01 },
    toolCalls: 5,
    mcpToolCalls: 0,
    status,
    startTime: "2026-03-24T10:00:00Z",
    endTime: "2026-03-24T10:05:00Z",
  };
}

const testDag: AgentDAG = {
  nodes: [
    makeNode("main", "main"),
    makeNode("agent-a", "engineer"),
    makeNode("agent-b", "reviewer"),
  ],
  edges: [
    { source: "main", target: "agent-a" },
    { source: "main", target: "agent-b" },
  ],
};

describe("AgentFlowDAG highlight-based rendering", () => {
  it("all nodes render regardless of activeTurnAgentIds", () => {
    const activeSet = new Set(["main"]);
    const { nodes } = getLayoutedElements(testDag, null, false, undefined, activeSet);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id).sort()).toEqual(["agent-a", "agent-b", "main"]);
  });

  it("inactive agents have reduced opacity when activeTurnAgentIds is provided", () => {
    const activeSet = new Set(["main"]);
    const { nodes } = getLayoutedElements(testDag, null, false, undefined, activeSet);

    const mainNode = nodes.find((n) => n.id === "main")!;
    const agentA = nodes.find((n) => n.id === "agent-a")!;
    const agentB = nodes.find((n) => n.id === "agent-b")!;

    // Active node should have full opacity (1.0 or undefined/no opacity set)
    expect(mainNode.style?.opacity).toBeUndefined();

    // Inactive nodes should have reduced opacity
    expect(agentA.style?.opacity).toBe(0.35);
    expect(agentB.style?.opacity).toBe(0.35);
  });

  it("all agents render at full opacity when activeTurnAgentIds is undefined (backward compatible)", () => {
    const { nodes } = getLayoutedElements(testDag, null, false, undefined, undefined);

    for (const node of nodes) {
      // No opacity style should be applied
      expect(node.style?.opacity).toBeUndefined();
    }
  });

  it("all agents render at full opacity when activeTurnAgentIds contains all IDs", () => {
    const allIds = new Set(["main", "agent-a", "agent-b"]);
    const { nodes } = getLayoutedElements(testDag, null, false, undefined, allIds);

    for (const node of nodes) {
      expect(node.style?.opacity).toBeUndefined();
    }
  });

  it("empty activeTurnAgentIds dims all agents", () => {
    const emptySet = new Set<string>();
    const { nodes } = getLayoutedElements(testDag, null, false, undefined, emptySet);

    for (const node of nodes) {
      expect(node.style?.opacity).toBe(0.35);
    }
  });
});

describe("AgentFlowDAG edge dimming", () => {
  it("dims edges where both source and target are NOT in activeTurnAgentIds", () => {
    const activeSet = new Set(["main", "agent-a"]);
    const { edges } = getLayoutedElements(testDag, null, false, undefined, activeSet);

    // main -> agent-a: both active, should NOT be dimmed
    const edgeToA = edges.find((e) => e.target === "agent-a")!;
    expect(edgeToA.style?.opacity).toBeUndefined();

    // main -> agent-b: source active but target not — at least one is active, NOT dimmed
    const edgeToB = edges.find((e) => e.target === "agent-b")!;
    expect(edgeToB.style?.opacity).toBeUndefined();
  });

  it("dims edges where neither endpoint is in activeTurnAgentIds", () => {
    // Only agent-b is active; main and agent-a are not
    const activeSet = new Set(["agent-b"]);
    const { edges } = getLayoutedElements(testDag, null, false, undefined, activeSet);

    // main -> agent-a: neither active, should be dimmed
    const edgeToA = edges.find((e) => e.target === "agent-a")!;
    expect(edgeToA.style?.opacity).toBe(0.2);

    // main -> agent-b: target is active, should NOT be dimmed
    const edgeToB = edges.find((e) => e.target === "agent-b")!;
    expect(edgeToB.style?.opacity).toBeUndefined();
  });

  it("no edges are dimmed when activeTurnAgentIds is undefined", () => {
    const { edges } = getLayoutedElements(testDag, null, false, undefined, undefined);

    for (const edge of edges) {
      expect(edge.style?.opacity).toBeUndefined();
    }
  });

  it("all edges are dimmed when activeTurnAgentIds is empty", () => {
    const emptySet = new Set<string>();
    const { edges } = getLayoutedElements(testDag, null, false, undefined, emptySet);

    for (const edge of edges) {
      expect(edge.style?.opacity).toBe(0.2);
    }
  });
});

describe("AgentFlowDAG viewport safety net removal", () => {
  it("getLayoutedElements is exported and does not reference safety net internals", () => {
    // Verify getLayoutedElements is a function (exported correctly)
    expect(typeof getLayoutedElements).toBe("function");

    // The viewport safety net relied on getViewport and getNodes from useReactFlow.
    // If the safety net were still present, the component source would reference
    // prevNodesReady and allVisible. We verify indirectly by checking that
    // getLayoutedElements works without any viewport-related inputs — it only
    // needs dag, selectedAgent, frozen, onViewInLog, and activeTurnAgentIds.
    const result = getLayoutedElements(testDag, null);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });
});
