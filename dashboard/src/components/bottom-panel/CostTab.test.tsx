import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostTab } from "./CostTab";
import type { SessionMetrics } from "../../lib/types";

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    session: {
      id: "s1",
      projectHash: "ph1",
      path: "/tmp/s1.jsonl",
      startTime: "2026-01-01T00:00:00Z",
      lastModified: "2026-01-01T00:01:00Z",
      eventCount: 10,
      subagentCount: 1,
    },
    dag: {
      nodes: [
        {
          id: "main",
          type: "main",
          status: "completed",
          toolCalls: 5,
          mcpToolCalls: 0,
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheWriteTokens: 200,
            cacheReadTokens: 800,
            totalCost: 0.45,
          },
        },
      ],
      edges: [],
    },
    tokens: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 200,
      cacheReadTokens: 800,
      totalCost: 0.45,
    },
    tokensByModel: {},
    tokensByTurn: [],
    tools: [],
    totalEvents: 10,
    totalToolCalls: 5,
    totalAgents: 1,
    models: ["claude-sonnet-4-20250514"],
    duration: 60000, // 1 minute
    contextPercent: 10,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
    ...overrides,
  };
}

describe("CostTab", () => {
  afterEach(cleanup);

  it("renders empty state with null metrics", () => {
    render(<CostTab metrics={null} />);
    expect(screen.getByText("No cost data")).toBeDefined();
  });

  it("renders cost cards with mock metrics", () => {
    render(<CostTab metrics={makeMetrics()} />);
    // Session Cost card
    expect(screen.getByText("Session Cost")).toBeDefined();
    // Burn Rate card
    expect(screen.getByText("Burn Rate")).toBeDefined();
    // Projected Total card (replaced Cache Savings)
    expect(screen.getByText("Projected Total")).toBeDefined();
  });

  it("renders agent breakdown with multiple agents", () => {
    const metrics = makeMetrics({
      dag: {
        nodes: [
          {
            id: "main",
            type: "main",
            status: "completed",
            toolCalls: 5,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 1000,
              outputTokens: 500,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 0.30,
            },
          },
          {
            id: "sub1",
            type: "coder",
            status: "completed",
            toolCalls: 3,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 500,
              outputTokens: 250,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 0.15,
            },
          },
        ],
        edges: [{ source: "main", target: "sub1" }],
      },
      tokens: {
        inputTokens: 1500,
        outputTokens: 750,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.45,
      },
    });
    render(<CostTab metrics={metrics} />);
    // Both agent types should appear
    expect(screen.getByText("main")).toBeDefined();
    expect(screen.getByText("coder")).toBeDefined();
  });

  it("formats costs correctly", () => {
    render(<CostTab metrics={makeMetrics()} />);
    // totalCost is 0.45, formatCost(0.45) = "$0.450"
    // Appears in Session Cost card and agent row — use getAllByText
    const costElements = screen.getAllByText("$0.450");
    expect(costElements.length).toBeGreaterThanOrEqual(1);
  });

  it("calculates burn rate correctly", () => {
    // duration=60000ms, totalCost=0.45 -> burnRate = (0.45/60000)*60000 = 0.45/min
    render(<CostTab metrics={makeMetrics()} />);
    // formatCost(0.45) = "$0.450" + "/min"
    expect(screen.getByText(/\$0\.450\/min/)).toBeDefined();
  });

  it("shows projected total card", () => {
    // Active session: has an active agent node
    const metrics = makeMetrics({
      dag: {
        nodes: [
          {
            id: "main",
            type: "main",
            status: "active",
            toolCalls: 5,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 1000,
              outputTokens: 500,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 0.45,
            },
          },
        ],
        edges: [],
      },
      contextPercent: 25,
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.50,
      },
    });
    const { container } = render(<CostTab metrics={metrics} />);
    expect(container.textContent).toContain("Projected");
    // projected = 0.50 * (100/25) = 2.00
    expect(container.textContent).toContain("$2.00");
    expect(container.textContent).toContain("estimated at current rate");
  });

  it("shows final cost when session done", () => {
    // Session done: duration > 0, no active agents
    const metrics = makeMetrics({
      duration: 300000,
      dag: {
        nodes: [
          {
            id: "main",
            type: "main",
            status: "completed",
            toolCalls: 5,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 1000,
              outputTokens: 500,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 1.25,
            },
          },
        ],
        edges: [],
      },
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 1.25,
      },
    });
    const { container } = render(<CostTab metrics={metrics} />);
    expect(container.textContent).toContain("Projected Total");
    expect(container.textContent).toContain("$1.25");
    expect(container.textContent).toContain("final");
  });

  it("shows In/Out token counts per agent when tokens > 0", () => {
    const metrics = makeMetrics({
      dag: {
        nodes: [
          {
            id: "main",
            type: "main",
            status: "completed",
            toolCalls: 5,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 1000,
              outputTokens: 500,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 0.45,
            },
          },
        ],
        edges: [],
      },
    });
    const { container } = render(<CostTab metrics={metrics} />);
    // formatTokens(1000) = "1K", formatTokens(500) = "500"
    expect(container.textContent).toContain("In: 1K");
    expect(container.textContent).toContain("Out: 500");
  });

  it("does not show token row when both inputTokens and outputTokens are zero", () => {
    const metrics = makeMetrics({
      dag: {
        nodes: [
          {
            id: "main",
            type: "main",
            status: "completed",
            toolCalls: 0,
            mcpToolCalls: 0,
            tokenUsage: {
              inputTokens: 0,
              outputTokens: 0,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              totalCost: 0,
            },
          },
        ],
        edges: [],
      },
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      },
    });
    const { container } = render(<CostTab metrics={metrics} />);
    // The token row (In: ... · Out: ...) should not appear when both are zero
    expect(container.textContent).not.toContain("In: 0");
    expect(container.textContent).not.toContain("Out: 0");
  });

  it("shows burn rate trend arrow", () => {
    const now = Date.now();
    const metrics = makeMetrics({
      duration: 120000,
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.50,
      },
      tokensByTurn: [
        {
          index: 0,
          timestamp: new Date(now - 90000).toISOString(),
          model: "claude-sonnet-4-6",
          inputTokens: 100,
          outputTokens: 50,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0.05,
          cumulativeCost: 0.05,
        },
        {
          index: 1,
          timestamp: new Date(now - 60000).toISOString(),
          model: "claude-sonnet-4-6",
          inputTokens: 100,
          outputTokens: 50,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0.05,
          cumulativeCost: 0.10,
        },
        // Recent turns (within last 30s) with much higher cost
        {
          index: 2,
          timestamp: new Date(now - 15000).toISOString(),
          model: "claude-sonnet-4-6",
          inputTokens: 500,
          outputTokens: 250,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0.20,
          cumulativeCost: 0.30,
        },
        {
          index: 3,
          timestamp: new Date(now - 5000).toISOString(),
          model: "claude-sonnet-4-6",
          inputTokens: 500,
          outputTokens: 250,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0.20,
          cumulativeCost: 0.50,
        },
      ],
    });
    const { container } = render(<CostTab metrics={metrics} />);
    const text = container.textContent ?? "";
    // Should show an up-trend arrow since recent spend >> overall rate
    const hasArrow = ["↑", "↓", "→"].some((a) => text.includes(a));
    expect(hasArrow).toBe(true);
  });

  describe("OpenTelemetry result fields (P2-5)", () => {
    it("renders Stop and Finish labels when both props supplied", () => {
      render(
        <CostTab
          metrics={makeMetrics()}
          stopReason="end_turn"
          finishReasons={["stop"]}
        />,
      );
      const row = screen.getByTestId("otel-result-row");
      expect(row.textContent).toContain("Stop:");
      expect(row.textContent).toContain("end_turn");
      expect(row.textContent).toContain("Finish:");
      expect(row.textContent).toContain("stop");
    });

    it("hides the row entirely when both OTel fields are absent", () => {
      render(<CostTab metrics={makeMetrics()} />);
      expect(screen.queryByTestId("otel-result-row")).toBeNull();
    });

    it("renders only Stop when finishReasons is empty", () => {
      render(
        <CostTab
          metrics={makeMetrics()}
          stopReason="tool_use"
          finishReasons={[]}
        />,
      );
      const row = screen.getByTestId("otel-result-row");
      expect(row.textContent).toContain("Stop: tool_use");
      expect(row.textContent).not.toContain("Finish:");
    });
  });
});
