import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AgentGraph } from "./AgentGraph";
import type { AgentDAG } from "../../lib/types";

// Mock gsap so jsdom doesn't choke on real DOM tweens.
vi.mock("gsap", () => ({
  default: {
    set: vi.fn(),
    to: vi.fn(),
    from: vi.fn(),
    timeline: () => ({
      from: vi.fn().mockReturnThis(),
      to: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(),
    }),
  },
}));

afterEach(cleanup);

const baseTokens = {
  inputTokens: 10,
  outputTokens: 5,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0.001,
};

const threeNodeDag = (): AgentDAG => ({
  nodes: [
    { id: "main", type: "main", tokenUsage: baseTokens, toolCalls: 1, mcpToolCalls: 0, status: "active" },
    { id: "agent_a", type: "engineer", parentId: "main", tokenUsage: baseTokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
    { id: "agent_b", type: "reviewer", parentId: "main", tokenUsage: baseTokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
  ],
  edges: [
    { source: "main", target: "agent_a" },
    { source: "main", target: "agent_b" },
  ],
});

describe("AgentGraph", () => {
  it("renders one AgentGraphNode per dag node and one edge per dag edge", () => {
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph-node-main")).toBeTruthy();
    expect(screen.getByTestId("agent-graph-node-agent_a")).toBeTruthy();
    expect(screen.getByTestId("agent-graph-node-agent_b")).toBeTruthy();
    const edges = screen.getAllByTestId(/^agent-graph-edge-/);
    expect(edges.length).toBe(2);
  });

  it("applies the running treatment to nodes in runningAgentIds", () => {
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set(["main"])}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph-node-main").getAttribute("data-running")).toBe("true");
    expect(screen.getByTestId("agent-graph-node-agent_a").getAttribute("data-running")).toBe("false");
  });

  it("calls onSelectAgent when a node is clicked", () => {
    const onSelectAgent = vi.fn();
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId={null}
        onSelectAgent={onSelectAgent}
      />,
    );
    fireEvent.click(screen.getByTestId("agent-graph-node-agent_a"));
    expect(onSelectAgent).toHaveBeenCalledWith("agent_a");
  });

  it("marks the selected node", () => {
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId="agent_b"
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph-node-agent_b").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("agent-graph-node-main").getAttribute("data-selected")).toBe("false");
  });

  it("shows an empty state when the dag has no nodes", () => {
    render(
      <AgentGraph
        dag={{ nodes: [], edges: [] }}
        runningAgentIds={new Set()}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph-empty").textContent).toMatch(/no agents/i);
  });
});
