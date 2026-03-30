/**
 * Tests for BottomPanel props extension (TASK-001)
 *
 * Verifies that BottomPanel accepts new session data props
 * without crashing, maintaining backward compatibility.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BottomPanel } from "./BottomPanel";
import type { SessionMetrics, AgentDAG, RepoGroup, SessionEvent, AssistantEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

// Mock @xyflow/react for TraceTab's AgentFlowDAG
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

// Mock AgentFlowDAG so BottomPanel tests stay unit-level
vi.mock("../../components/AgentFlowDAG", () => ({
  AgentFlowDAG: () => <div data-testid="agent-flow-dag" />,
}));

// Mock tanstack router for HistoryTab
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// Minimal valid SessionMetrics fixture
const mockMetrics: SessionMetrics = {
  session: {
    id: "s1",
    projectHash: "ph1",
    path: "/tmp/s1.jsonl",
    startTime: "2026-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:01:00Z",
    eventCount: 2,
    subagentCount: 0,
  },
  dag: { nodes: [], edges: [] },
  tokens: {
    inputTokens: 100,
    outputTokens: 50,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0.5,
  },
  tokensByModel: {},
  tokensByTurn: [],
  tools: [],
  totalEvents: 2,
  totalToolCalls: 0,
  totalAgents: 1,
  models: ["claude-sonnet-4-20250514"],
  duration: 60,
  contextPercent: 10,
  contextWindowSize: 200000,
  tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
  hasRemoteControl: false,
};

const mockDag: AgentDAG = { nodes: [], edges: [] };

const mockTurn: TurnSnapshot = {
  turnNumber: 1,
  promptText: "hello",
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

const mockRepoGroup: RepoGroup = {
  cwd: "/tmp/repo",
  repoName: "test-repo",
  sessions: [],
  lastActive: "2026-01-01T00:00:00Z",
  hasActiveSessions: false,
};

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((_i: number) => null),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("BottomPanel", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("renders with no props (backward compat)", () => {
    render(<BottomPanel />);
    expect(screen.getByText("Trace")).toBeDefined();
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("renders with all new session data props without crashing", () => {
    render(
      <BottomPanel
        detailCount={3}
        metrics={mockMetrics}
        turns={[mockTurn]}
        events={[]}
        liveEvents={[]}
        dag={mockDag}
        activeTurnIndex={0}
        selectedAgent="main"
        onSelectAgent={() => {}}
        repos={[mockRepoGroup]}
        projectHash="abc123"
        sessionId="session-1"
        isLive={true}
        hasSubagents={false}
      />,
    );
    expect(screen.getByText("Trace")).toBeDefined();
    expect(screen.getByText("History")).toBeDefined();
  });

  it("renders with partial props (only metrics)", () => {
    render(<BottomPanel metrics={mockMetrics} sessionId="s1" />);
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("renders TraceTab with empty state when dag is null", () => {
    render(<BottomPanel dag={null} />);
    // Trace tab is active by default -- should show empty state
    expect(screen.getByText("No agent data")).toBeDefined();
  });

  it("persists collapsed state to localStorage", () => {
    localStorageMock.setItem("bottomPanel.collapsed", "true");
    const { container } = render(<BottomPanel />);
    // When collapsed, the panel body should not be rendered
    // The panel body has overflow-y-auto class and height style
    const panelBody = container.querySelector(".overflow-y-auto");
    expect(panelBody).toBeNull();
  });

  it("renders without crashing when hasSubagents transitions", () => {
    const { rerender } = render(<BottomPanel hasSubagents={false} />);
    rerender(<BottomPanel hasSubagents={true} />);
    // Should still render fine
    expect(screen.getByText("Trace")).toBeDefined();
  });

  it("renders LiveTab when Live tab is clicked", () => {
    render(<BottomPanel events={[]} liveEvents={[]} isLive={false} />);
    fireEvent.click(screen.getByText("Live"));
    // LiveTab shows "Waiting for events..." when empty
    expect(screen.getByText("Waiting for events...")).toBeDefined();
  });

  it("renders CostTab when Cost tab is clicked with metrics", () => {
    render(<BottomPanel metrics={mockMetrics} />);
    fireEvent.click(screen.getByText("Cost"));
    // CostTab shows "Session Cost" card label
    expect(screen.getByText("Session Cost")).toBeDefined();
  });

  it("renders CostTab empty state when no metrics", () => {
    render(<BottomPanel metrics={null} />);
    fireEvent.click(screen.getByText("Cost"));
    expect(screen.getByText("No cost data")).toBeDefined();
  });

  it("renders DetailTab when Detail tab is clicked with no active turn", () => {
    render(<BottomPanel turns={[mockTurn]} activeTurnIndex={null} />);
    fireEvent.click(screen.getByText("Detail"));
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("renders RawTab when Raw tab is clicked with no active turn", () => {
    render(<BottomPanel turns={[mockTurn]} activeTurnIndex={null} />);
    fireEvent.click(screen.getByText("Raw"));
    expect(screen.getByText("Select a turn to see raw events")).toBeDefined();
  });

  it("renders HistoryTab when History tab is clicked", () => {
    render(<BottomPanel repos={[]} sessionId="s1" />);
    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText("No session history")).toBeDefined();
  });

  it("renders LiveTab with events showing event rows", () => {
    const event: SessionEvent = {
      type: "system",
      subtype: "init",
      timestamp: "2026-01-01T00:00:00.000Z",
      uuid: "ev-1",
      sessionId: "s1",
      message: { role: "system", content: "" },
    } as SessionEvent;
    render(<BottomPanel events={[event]} liveEvents={[]} isLive={true} />);
    fireEvent.click(screen.getByText("Live"));
    expect(screen.getAllByTestId("event-row").length).toBe(1);
  });
});
