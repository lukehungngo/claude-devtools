import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AgentDAG, AgentNode } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { TraceTab } from "./TraceTab";
import {
  computeTimeline,
  computeBarPosition,
  getSpanColor,
  getSpanIcon,
} from "./TraceTab";

function makeNode(overrides: Partial<AgentNode> & { id: string }): AgentNode {
  return {
    type: "engineer",
    status: "completed",
    toolCalls: 5,
    mcpToolCalls: 0,
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.5,
    },
    ...overrides,
  };
}

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

  it("renders trace rows for each node", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          description: "Orchestrator",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:10:00Z",
        }),
        makeNode({
          id: "agent-1",
          type: "engineer",
          description: "SWE frontend",
          parentId: "main",
          startTime: "2026-01-01T00:01:00Z",
          endTime: "2026-01-01T00:05:00Z",
        }),
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };
    render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    expect(screen.getByText("Orchestrator")).toBeDefined();
    expect(screen.getByText("SWE frontend")).toBeDefined();
  });

  it("shows correct agent icons", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          description: "Orchestrator",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:10:00Z",
        }),
        makeNode({
          id: "agent-1",
          type: "reviewer",
          description: "Code Reviewer",
          parentId: "main",
          startTime: "2026-01-01T00:01:00Z",
          endTime: "2026-01-01T00:05:00Z",
        }),
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };
    render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    expect(screen.getByText("PM")).toBeDefined();
    expect(screen.getByText("CR")).toBeDefined();
  });

  it("shows 'running' in duration column for active agents", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          description: "Orchestrator",
          status: "active",
          startTime: "2026-01-01T00:00:00Z",
        }),
      ],
      edges: [],
    };
    const { container } = render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    // "running" shows in the duration column and as bar internal indicator
    expect(screen.getAllByText("running").length).toBeGreaterThanOrEqual(1);
  });

  it("renders duration and cost in separate columns", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          description: "Orchestrator",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:01:00Z",
          toolCalls: 3,
          tokenUsage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            totalCost: 0.05,
          },
        }),
      ],
      edges: [],
    };
    const { container } = render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    // Duration and cost in their own columns
    const durationCols = container.querySelectorAll(".trace-col-duration");
    const costCols = container.querySelectorAll(".trace-col-cost");
    // Header + 1 data row = 2 each
    expect(durationCols.length).toBeGreaterThanOrEqual(2);
    expect(costCols.length).toBeGreaterThanOrEqual(2);
    // Bar should be a pure colored rectangle (no text for completed bars)
    const bars = container.querySelectorAll(".trace-bar");
    for (const bar of bars) {
      const directText = Array.from(bar.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean);
      expect(directText).toEqual([]);
    }
  });

  it("shows 'running' in duration column for active bars", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          description: "Orchestrator",
          status: "active",
          startTime: "2026-01-01T00:00:00Z",
        }),
      ],
      edges: [],
    };
    const { container } = render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={300}
      />,
    );
    // Duration column shows "running" for active agents
    const durationCols = container.querySelectorAll(".trace-col-duration");
    const dataCol = Array.from(durationCols).find(
      (el) => !el.classList.contains("trace-col-header"),
    );
    expect(dataCol?.textContent).toBe("running");
  });

  it("sets container height to panelHeight - 37", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "main",
          type: "orchestrator",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:10:00Z",
        }),
      ],
      edges: [],
    };
    const { container } = render(
      <TraceTab
        dag={dag}
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

describe("computeTimeline", () => {
  it("computes start, end, and ticks from nodes", () => {
    const nodes: AgentNode[] = [
      makeNode({
        id: "a",
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T00:40:00Z",
      }),
      makeNode({
        id: "b",
        startTime: "2026-01-01T00:05:00Z",
        endTime: "2026-01-01T00:30:00Z",
      }),
    ];
    const timeline = computeTimeline(nodes);
    expect(timeline.sessionStartMs).toBe(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
    expect(timeline.sessionEndMs).toBe(
      new Date("2026-01-01T00:40:00Z").getTime(),
    );
    expect(timeline.totalMs).toBe(40 * 60 * 1000);
    expect(timeline.ticks.length).toBeGreaterThanOrEqual(2);
    expect(timeline.ticks[0]).toBe("0m");
  });

  it("handles single node with no times", () => {
    const nodes: AgentNode[] = [makeNode({ id: "a" })];
    const timeline = computeTimeline(nodes);
    expect(timeline.totalMs).toBeGreaterThan(0);
    expect(timeline.ticks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeBarPosition", () => {
  it("computes left and width percentages", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const total = 10 * 60 * 1000; // 10 min
    const node = makeNode({
      id: "a",
      startTime: "2026-01-01T00:02:00Z",
      endTime: "2026-01-01T00:07:00Z",
    });
    const pos = computeBarPosition(node, start, total);
    expect(pos.leftPct).toBeCloseTo(20);
    expect(pos.widthPct).toBeCloseTo(50);
  });

  it("extends active agents to 100%", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const total = 10 * 60 * 1000;
    const node = makeNode({
      id: "a",
      status: "active",
      startTime: "2026-01-01T00:02:00Z",
    });
    const pos = computeBarPosition(node, start, total);
    expect(pos.leftPct).toBeCloseTo(20);
    expect(pos.widthPct).toBeCloseTo(80);
  });

  it("defaults to full width when no times", () => {
    const pos = computeBarPosition(
      makeNode({ id: "a" }),
      Date.now(),
      60000,
    );
    expect(pos.leftPct).toBe(0);
    expect(pos.widthPct).toBe(100);
  });

  it("uses 0.3% minimum width for very short completed spans", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const total = 10 * 60 * 1000; // 10 min
    // Node starts at 9m59.4s and ends at 9m59.46s — 60ms duration
    // Raw width = 60 / 600000 * 100 = 0.01%
    const node = makeNode({
      id: "tiny",
      startTime: "2026-01-01T00:09:59.400Z",
      endTime: "2026-01-01T00:09:59.460Z",
    });
    const pos = computeBarPosition(node, start, total);
    expect(pos.widthPct).toBeCloseTo(0.3);
  });
});

describe("getSpanColor", () => {
  it("returns known colors for orchestrator", () => {
    const c = getSpanColor("orchestrator");
    expect(c.bg).toBe("var(--span-pm)");
    expect(c.text).toBe("var(--span-pm-t)");
  });

  it("returns fallback for unknown type", () => {
    const c = getSpanColor("unknown-type");
    expect(c.bg).toBeTruthy();
    expect(c.text).toBeTruthy();
  });
});

describe("TraceTab row heights", () => {
  afterEach(cleanup);

  it("renders tool call rows with trace-row-tool class for depth > 1 nodes", () => {
    const dag: AgentDAG = {
      nodes: [
        makeNode({
          id: "root",
          type: "orchestrator",
          description: "Root",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:10:00Z",
        }),
        makeNode({
          id: "agent-1",
          type: "engineer",
          description: "Agent1",
          parentId: "root",
          startTime: "2026-01-01T00:01:00Z",
          endTime: "2026-01-01T00:05:00Z",
        }),
        makeNode({
          id: "tool-1",
          type: "engineer",
          description: "ToolCall1",
          parentId: "agent-1",
          startTime: "2026-01-01T00:02:00Z",
          endTime: "2026-01-01T00:03:00Z",
        }),
      ],
      edges: [
        { source: "root", target: "agent-1" },
        { source: "agent-1", target: "tool-1" },
      ],
    };
    const { container } = render(
      <TraceTab
        dag={dag}
        turns={[mockTurn]}
        activeTurnIndex={null}
        selectedAgent={null}
        panelHeight={400}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    // root (depth 0) and agent-1 (depth 1) should NOT have trace-row-tool
    // tool-1 (depth 2) SHOULD have trace-row-tool
    const toolRows = container.querySelectorAll(".trace-row-tool");
    expect(toolRows.length).toBe(1);
    // The tool row should contain "ToolCall1"
    expect(toolRows[0].textContent).toContain("ToolCall1");
    // Agent rows should not have the class
    expect(rows.length).toBe(3);
    const nonToolRows = container.querySelectorAll(".trace-row:not(.trace-row-tool)");
    expect(nonToolRows.length).toBe(2);
  });
});

describe("getSpanIcon", () => {
  it("returns PM for orchestrator", () => {
    expect(getSpanIcon("orchestrator", 0)).toBe("PM");
  });

  it("numbers engineers", () => {
    expect(getSpanIcon("engineer", 0)).toBe("S1");
    expect(getSpanIcon("engineer", 1)).toBe("S2");
  });

  it("returns first 2 chars for unknown types", () => {
    expect(getSpanIcon("custom-agent", 0)).toBe("CU");
  });
});
