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
    // Cache Savings card
    expect(screen.getByText("Cache Savings")).toBeDefined();
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
});
