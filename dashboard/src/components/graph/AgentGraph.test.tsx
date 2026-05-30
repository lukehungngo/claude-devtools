import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AgentDAG } from "../../lib/types";
import type { AgentFlowNode, AgentFlowEdge } from "../../lib/agentFlowElements";

// react-flow needs ResizeObserver + a real layout engine that jsdom lacks, so
// we mock it. The mock renders each node through nodeTypes.agent and each edge
// as a testid'd stub, and wires onNodeClick — enough to assert our integration.
interface MockReactFlowProps {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  nodeTypes: Record<string, (p: { id: string; data: unknown; selected?: boolean; type: string }) => ReactNode>;
  onNodeClick?: (e: unknown, n: { id: string }) => void;
  children?: ReactNode;
}

vi.mock("@xyflow/react", () => {
  const ReactFlow = ({ nodes, edges, nodeTypes, onNodeClick, children }: MockReactFlowProps) => (
    <div data-testid="rf">
      {nodes.map((n) => {
        const NodeComp = nodeTypes[n.type ?? "agent"];
        return (
          <div key={n.id} data-testid={`rf-node-${n.id}`} onClick={(e) => onNodeClick?.(e, n)}>
            {NodeComp ? (
              <NodeComp id={n.id} data={n.data} selected={n.selected} type={n.type ?? "agent"} />
            ) : null}
          </div>
        );
      })}
      {edges.map((e) => (
        <div key={e.id} data-testid={`agent-graph-edge-${e.source}-${e.target}`} />
      ))}
      {children}
    </div>
  );
  return {
    ReactFlow,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
    useNodesState: <T,>(initial: T) => [initial, vi.fn(), vi.fn()],
    useEdgesState: <T,>(initial: T) => [initial, vi.fn(), vi.fn()],
  };
});

import { AgentGraph } from "./AgentGraph";

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
  it("renders one node per dag node and one edge per dag edge", () => {
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

  it("calls onSelectAgent with the node id when a node is clicked", () => {
    const onSelectAgent = vi.fn();
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId={null}
        onSelectAgent={onSelectAgent}
      />,
    );
    fireEvent.click(screen.getByTestId("rf-node-agent_a"));
    expect(onSelectAgent).toHaveBeenCalledWith("agent_a");
  });

  it("expands (selects) the selected node and leaves the others compact", () => {
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId="agent_b"
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph-node-agent_b").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("agent-graph-node-agent_b").getAttribute("data-expanded")).toBe("true");
    expect(screen.getByTestId("agent-graph-node-main").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("agent-graph-node-main").getAttribute("data-expanded")).toBe("false");
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

  it("renders the react-flow canvas container", () => {
    render(
      <AgentGraph
        dag={threeNodeDag()}
        runningAgentIds={new Set()}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agent-graph")).toBeTruthy();
    expect(screen.getByTestId("rf")).toBeTruthy();
  });
});
