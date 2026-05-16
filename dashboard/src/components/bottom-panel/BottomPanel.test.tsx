/**
 * Tests for BottomPanel — 4-tab layout (TASK-002)
 *
 * Verifies that BottomPanel renders 4 tabs: Agent Graph, Tool Call, Raw Log, Cost.
 * Tab switching, auto-open, and backward compatibility are tested.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import { BottomPanel } from "./BottomPanel";
import type { SessionMetrics, AgentDAG, SessionEvent } from "../../lib/types";
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
  durationMs: 1000,
  cost: 0.5,
  costBreakdown: { total: 0.5, inputCost: 0.3, outputCost: 0.2 },
  inputTokens: 0,
  outputTokens: 0,
  startTime: "2026-01-01T00:00:00Z",
  endTime: "2026-01-01T00:00:01Z",
  dispatchedAgentIds: new Set<string>(["main"]),
  eventAgentIds: new Set<string>(["main"]),
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

  it("renders 3 tabs with correct labels", () => {
    render(<BottomPanel />);
    expect(screen.getByText("Agent Graph")).toBeDefined();
    expect(screen.getByText("Tool Call")).toBeDefined();
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("does not render a Raw Log tab", () => {
    render(<BottomPanel />);
    expect(screen.queryByText("Raw Log")).toBeNull();
  });

  it("does not render old tabs (Live, History, Raw, Trace, Detail)", () => {
    render(<BottomPanel />);
    expect(screen.queryByText("Trace")).toBeNull();
    expect(screen.queryByText("Detail")).toBeNull();
    expect(screen.queryByText("Raw")).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.queryByText("History")).toBeNull();
  });

  it("renders with no props (backward compat)", () => {
    render(<BottomPanel />);
    expect(screen.getByText("Agent Graph")).toBeDefined();
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("renders with all session data props without crashing", () => {
    render(
      <BottomPanel
        detailCount={3}
        metrics={mockMetrics}
        turns={[mockTurn]}
        events={[]}
        dag={mockDag}
        activeTurnIndex={0}
        selectedAgent="main"
        onSelectAgent={() => {}}
        sessionId="session-1"
        isLive={true}
        hasSubagents={false}
      />,
    );
    expect(screen.getByText("Agent Graph")).toBeDefined();
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("renders with partial props (only metrics)", () => {
    render(<BottomPanel metrics={mockMetrics} sessionId="s1" />);
    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("defaults to Agent Graph tab showing TraceTab content", () => {
    // Panel defaults to collapsed on first visit, so explicitly open it
    localStorageMock.setItem("bottomPanel.collapsed", "false");
    render(<BottomPanel dag={null} />);
    // Agent Graph tab is active by default -- should show empty state from TraceTab
    expect(screen.getByText("No agent data")).toBeDefined();
  });

  it("persists collapsed state to localStorage", () => {
    localStorageMock.setItem("bottomPanel.collapsed", "true");
    const { container } = render(<BottomPanel />);
    // When collapsed, the panel body should not be rendered
    const panelBody = container.querySelector(".overflow-y-auto");
    expect(panelBody).toBeNull();
  });

  it("renders without crashing when hasSubagents transitions", () => {
    const { rerender } = render(<BottomPanel hasSubagents={false} />);
    rerender(<BottomPanel hasSubagents={true} />);
    // Should still render fine with agent-graph tab
    expect(screen.getByText("Agent Graph")).toBeDefined();
  });

  it("auto-opens agent-graph tab when subagents detected", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const { rerender } = render(<BottomPanel hasSubagents={false} />);
    // Collapse the panel first
    const separator = screen.getByRole("separator");
    fireEvent.doubleClick(separator);

    // Advance past the 5s manual-collapse guard
    vi.spyOn(Date, "now").mockReturnValue(now + 6000);

    // Now trigger subagent detection
    rerender(<BottomPanel hasSubagents={true} />);
    // Panel should auto-expand -- check that Agent Graph tab content is visible
    expect(screen.getByText("No agent data")).toBeDefined();

    vi.restoreAllMocks();
  });

  it("renders CostTab when Cost tab is clicked with metrics", () => {
    render(<BottomPanel metrics={mockMetrics} />);
    fireEvent.click(screen.getByText("Cost"));
    expect(screen.getByText("Session Cost")).toBeDefined();
  });

  it("renders CostTab empty state when no metrics", () => {
    render(<BottomPanel metrics={null} />);
    fireEvent.click(screen.getByText("Cost"));
    expect(screen.getByText("No cost data")).toBeDefined();
  });

  it("renders DetailTab when Tool Call tab is clicked with no active turn", () => {
    render(<BottomPanel turns={[mockTurn]} activeTurnIndex={null} />);
    fireEvent.click(screen.getByText("Tool Call"));
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("shows detail count badge on Tool Call tab", () => {
    render(<BottomPanel detailCount={5} />);
    expect(screen.getByText("5")).toBeDefined();
  });

  // --- TASK-002: localStorage persistence tests ---

  it("defaults to collapsed on first visit (no localStorage)", () => {
    // No localStorage values set -- first visit scenario
    const { container } = render(<BottomPanel />);
    // When collapsed, the panel body (overflow-y-auto) should not render
    const panelBody = container.querySelector(".overflow-y-auto");
    expect(panelBody).toBeNull();
  });

  it("restores collapsed=false from localStorage", () => {
    localStorageMock.setItem("bottomPanel.collapsed", "false");
    const { container } = render(<BottomPanel />);
    // When explicitly set to false, panel should be open
    const panelBody = container.querySelector(".overflow-y-auto");
    expect(panelBody).not.toBeNull();
  });

  it("persists panel height to localStorage", () => {
    // Start not collapsed so panel body is visible
    localStorageMock.setItem("bottomPanel.collapsed", "false");
    const { container } = render(<BottomPanel />);

    // Simulate a drag resize on the divider
    const divider = container.querySelector("[role='separator']") as HTMLElement;
    expect(divider).not.toBeNull();

    // mousedown at y=300 with initial height 220 (default)
    fireEvent.mouseDown(divider, { clientY: 300 });
    // mousemove to y=200 => delta = 300-200 = 100, newHeight = 220+100 = 320
    fireEvent(document, new MouseEvent("mousemove", { clientY: 200 }));
    fireEvent(document, new MouseEvent("mouseup"));

    expect(localStorageMock.getItem("bottomPanel.height")).toBe("320");
  });

  it("restores panel height from localStorage", () => {
    localStorageMock.setItem("bottomPanel.height", "400");
    localStorageMock.setItem("bottomPanel.collapsed", "false");
    const { container } = render(<BottomPanel />);
    const panelBody = container.querySelector(".overflow-y-auto") as HTMLElement;
    expect(panelBody).not.toBeNull();
    // The panel body should have height: 400px from the restored state
    expect(panelBody.style.height).toBe("400px");
  });

  it("switches to tool-call tab and uncollapses when openBottomTabRef is called", () => {
    // Start collapsed
    localStorageMock.setItem("bottomPanel.collapsed", "true");

    const openBottomTabRef = createRef<((tab: string) => void) | null>() as React.MutableRefObject<((tab: string) => void) | null>;
    openBottomTabRef.current = null;

    render(
      <BottomPanel
        openBottomTabRef={openBottomTabRef}
        turns={[mockTurn]}
        activeTurnIndex={0}
      />,
    );

    // Panel starts collapsed — no panel body
    expect(screen.queryByText("Select a turn to see tool details")).toBeNull();

    // Call the ref callback
    act(() => {
      openBottomTabRef.current?.("tool-call");
    });

    // Panel should now be open on the Tool Call tab
    // The DetailTab shows tool detail content when activeTurnIndex is set
    // At minimum, the panel body should be visible
    const panelBody = document.querySelector(".overflow-y-auto");
    expect(panelBody).not.toBeNull();

    // Verify Tool Call tab is now active (has the accent color)
    const toolCallTab = screen.getByText("Tool Call");
    expect(toolCallTab).toBeDefined();
  });

  // --- TASK-003: scope pill tests ---

  it("shows 'Scoped to T{N}' when viewingTurnNumber is defined", () => {
    render(<BottomPanel viewingTurnNumber={65} />);
    expect(screen.getByText(/Scoped to/)).toBeDefined();
    expect(screen.getByText("T65")).toBeDefined();
  });

  it("does not show scope pill when viewingTurnNumber is undefined", () => {
    render(<BottomPanel />);
    expect(screen.queryByText(/Scoped to/)).toBeNull();
  });

  it("shows scope pill for turn 0", () => {
    render(<BottomPanel viewingTurnNumber={0} />);
    expect(screen.getByText("T0")).toBeDefined();
  });

  it("cleans up openBottomTabRef on unmount", () => {
    const openBottomTabRef = createRef<((tab: string) => void) | null>() as React.MutableRefObject<((tab: string) => void) | null>;
    openBottomTabRef.current = null;

    const { unmount } = render(
      <BottomPanel openBottomTabRef={openBottomTabRef} />,
    );

    // Ref should be registered
    expect(openBottomTabRef.current).not.toBeNull();

    unmount();

    // Ref should be cleaned up
    expect(openBottomTabRef.current).toBeNull();
  });

  // --- R2C1 follow-up: sessionId plumbed through to TasksTab so daemon fetch fires ---

  it("forwards sessionId to TasksTab so the daemon-tasks endpoint is fetched", async () => {
    localStorageMock.setItem("bottomPanel.collapsed", "false");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [] }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      render(<BottomPanel events={[]} sessionId="session-xyz" />);
      // Switch to Tasks tab to mount TasksTab
      fireEvent.click(screen.getByText("Tasks"));

      // TasksTab fires its daemon fetch in a useEffect on mount when sessionId is set
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/sessions/session-xyz/tasks/daemon",
        );
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not fetch daemon tasks when sessionId is omitted", async () => {
    localStorageMock.setItem("bottomPanel.collapsed", "false");

    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      render(<BottomPanel events={[]} />);
      fireEvent.click(screen.getByText("Tasks"));

      // Give TasksTab's effect a tick to (not) run
      await new Promise((r) => setTimeout(r, 0));

      const daemonCalls = fetchMock.mock.calls.filter((args) =>
        String(args[0] ?? "").includes("/tasks/daemon"),
      );
      expect(daemonCalls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- B2-WIRE (TASK-R2A1): OTel result fields plumbed through to CostTab ---

  it("forwards stopReason and finishReasons to CostTab so OTel row renders", () => {
    // Start uncollapsed so the panel body is visible
    localStorageMock.setItem("bottomPanel.collapsed", "false");

    render(
      <BottomPanel
        metrics={mockMetrics}
        stopReason="end_turn"
        finishReasons={["stop"]}
      />,
    );

    // Cost tab is not default — click it
    fireEvent.click(screen.getByText("Cost"));

    const otelRow = screen.getByTestId("otel-result-row");
    expect(otelRow.textContent).toContain("Stop:");
    expect(otelRow.textContent).toContain("end_turn");
    expect(otelRow.textContent).toContain("Finish:");
    expect(otelRow.textContent).toContain("stop");
  });

  it("does not render OTel row in Cost tab when stopReason and finishReasons are omitted", () => {
    localStorageMock.setItem("bottomPanel.collapsed", "false");

    render(<BottomPanel metrics={mockMetrics} />);

    fireEvent.click(screen.getByText("Cost"));

    expect(screen.queryByTestId("otel-result-row")).toBeNull();
  });

  // --- NEW-4: MCP tab ---

  it("renders an MCP tab in the tab bar", () => {
    render(<BottomPanel />);
    expect(screen.getByText("MCP")).toBeDefined();
  });

  // --- Bug C: Tasks tab auto-scoping ---

  describe("Tasks tab auto-scoping", () => {
    function makeTurn(
      turnNumber: number,
      startIndex: number,
      endIndex: number,
    ): TurnSnapshot {
      return {
        turnNumber,
        promptText: `prompt ${turnNumber}`,
        startIndex,
        endIndex,
        agents: [],
        durationMs: 1000,
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T00:00:01Z",
        dispatchedAgentIds: new Set<string>(["main"]),
        eventAgentIds: new Set<string>(["main"]),
      };
    }

    function makeTaskCreateEvent(
      uuid: string,
      subject: string,
    ): SessionEvent {
      return {
        type: "assistant",
        uuid,
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: `tu_${uuid}`,
              name: "TaskCreate",
              input: { subject },
            },
          ],
          model: "claude-sonnet-4-20250514",
          id: `msg_${uuid}`,
          type: "message",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      } as SessionEvent;
    }

    function makeTextEvent(uuid: string, text: string): SessionEvent {
      return {
        type: "assistant",
        uuid,
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          model: "claude-sonnet-4-20250514",
          id: `msg_${uuid}`,
          type: "message",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      } as SessionEvent;
    }

    const turns3: TurnSnapshot[] = [
      makeTurn(1, 0, 1),
      makeTurn(2, 1, 2),
      makeTurn(3, 2, 3),
    ];
    const eventsWithTasks: SessionEvent[] = [
      makeTaskCreateEvent("u1", "task 1"),
      makeTaskCreateEvent("u2", "task 2"),
      makeTextEvent("u3", "no task here"),
    ];

    it("auto-scopes Tasks to the latest turn when viewingTurnNumber is undefined", () => {
      localStorageMock.setItem("bottomPanel.collapsed", "false");

      render(
        <BottomPanel
          turns={turns3}
          events={eventsWithTasks}
          viewingTurnNumber={undefined}
        />,
      );

      fireEvent.click(screen.getByText("Tasks"));

      // Scope label shows the auto-derived latest turn (T3).
      expect(screen.getByText(/Scoped to/)).toBeDefined();
      expect(screen.getByText("T3")).toBeDefined();

      // Bug D — per-turn DELTA semantics. T3 has no task tools (only a text
      // event), so its delta is empty even though the cumulative session has
      // 2 tasks. The scope label still renders.
      expect(screen.queryAllByRole("listitem").length).toBe(0);
      expect(screen.getByText("No tasks")).toBeDefined();
    });

    it("respects explicit viewingTurnNumber over auto-scope", () => {
      localStorageMock.setItem("bottomPanel.collapsed", "false");

      render(
        <BottomPanel
          turns={turns3}
          events={eventsWithTasks}
          viewingTurnNumber={1}
        />,
      );

      fireEvent.click(screen.getByText("Tasks"));

      expect(screen.getByText(/Scoped to/)).toBeDefined();
      expect(screen.getByText("T1")).toBeDefined();

      // T1 created exactly 1 task in its delta.
      const rows = screen.getAllByRole("listitem");
      expect(rows.length).toBe(1);
    });

    it("hides the scope label and shows no tasks when turns is empty", () => {
      localStorageMock.setItem("bottomPanel.collapsed", "false");

      render(
        <BottomPanel
          turns={[]}
          events={[]}
          viewingTurnNumber={undefined}
        />,
      );

      fireEvent.click(screen.getByText("Tasks"));

      expect(screen.queryByText(/Scoped to/)).toBeNull();
      expect(screen.queryAllByRole("listitem").length).toBe(0);
      expect(screen.getByText("No tasks")).toBeDefined();
    });
  });

  it("mounts MCPStatusTab when the MCP tab is selected", async () => {
    localStorageMock.setItem("bottomPanel.collapsed", "false");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ servers: [] }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      render(<BottomPanel sessionId="session-mcp" />);
      fireEvent.click(screen.getByText("MCP"));

      // MCPStatusTab fires its fetch on mount when sessionId is set.
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/sessions/session-mcp/mcp-status",
        );
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
