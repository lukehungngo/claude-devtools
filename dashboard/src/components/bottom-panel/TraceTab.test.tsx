import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AgentDAG } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

// Mock @xyflow/react before importing anything that uses it
vi.mock("@xyflow/react", () => ({
  ReactFlow: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: () => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn() }),
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  Handle: () => null,
  BaseEdge: () => null,
  getStraightPath: () => ["", 0, 0],
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

// Mock AgentFlowDAG itself so we test TraceTab in isolation
vi.mock("../../components/AgentFlowDAG", () => ({
  AgentFlowDAG: () => <div data-testid="agent-flow-dag" />,
}));

import { TraceTab } from "./TraceTab";

const mockTurn: TurnSnapshot = {
  turnNumber: 1,
  promptText: "hello",
  events: [],
  startIndex: 0,
  endIndex: 0,
  agents: [],
  status: "completed",
  durationMs: 1000,
  cost: 0.5,
  costBreakdown: { total: 0.5, tokensIn: 0.3, tokensOut: 0.2 },
  startTime: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:00:01Z",
  endTime: "2026-01-01T00:00:01Z",
};

const mockDag: AgentDAG = {
  nodes: [
    {
      id: "main",
      type: "main",
      status: "completed",
      toolCalls: 3,
      mcpToolCalls: 0,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.5,
      },
    },
  ],
  edges: [],
};

describe("TraceTab", () => {
  afterEach(cleanup);

  it("shows empty state when dag is null", () => {
    render(
      <TraceTab
        dag={null}
        turns={[]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={220}
      />,
    );
    expect(screen.getByText("No agent data")).toBeDefined();
  });

  it("shows empty state when dag has 0 nodes", () => {
    render(
      <TraceTab
        dag={{ nodes: [], edges: [] }}
        turns={[]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={220}
      />,
    );
    expect(screen.getByText("No agent data")).toBeDefined();
  });

  it("renders AgentFlowDAG when dag has nodes", () => {
    render(
      <TraceTab
        dag={mockDag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    expect(screen.getByTestId("agent-flow-dag")).toBeDefined();
  });

  it("renders without crashing with all props", () => {
    render(
      <TraceTab
        dag={mockDag}
        turns={[mockTurn]}
        activeTurnIndex={0}
        selectedAgent="main"
        onSelectAgent={vi.fn()}
        isLive={true}
        panelHeight={400}
      />,
    );
    expect(screen.getByTestId("agent-flow-dag")).toBeDefined();
  });

  it("sets container height to panelHeight - 37", () => {
    const { container } = render(
      <TraceTab
        dag={mockDag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("263px");
  });
});
