import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CostStrip } from "./CostStrip";
import type { SessionMetrics } from "../../lib/types";

function makeMetrics(overrides: Partial<SessionMetrics["tokens"]> = {}): SessionMetrics {
  return {
    session: { id: "abc12345678" } as SessionMetrics["session"],
    dag: { nodes: [], edges: [] } as SessionMetrics["dag"],
    tokens: {
      inputTokens: 10000,
      outputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.05,
      ...overrides,
    },
    tokensByModel: {},
    tokensByTurn: [],
    tools: [],
    totalEvents: 0,
    totalToolCalls: 0,
    totalAgents: 1,
    models: [],
    duration: 5000,
    contextPercent: 10,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, pending: 0, inProgress: 0 },
    hasRemoteControl: false,
  } as SessionMetrics;
}

describe("CostStrip", () => {
  it("does not show Cached when cacheReadTokens is 0", () => {
    render(<CostStrip metrics={makeMetrics({ cacheReadTokens: 0 })} />);
    expect(screen.queryByText(/Cached/i)).toBeNull();
  });

  it("shows Cached tokens when cacheReadTokens > 0", () => {
    render(<CostStrip metrics={makeMetrics({ cacheReadTokens: 3100 })} />);
    expect(screen.getByText(/Cached/i)).toBeDefined();
  });

  it("shows In and Out tokens", () => {
    render(<CostStrip metrics={makeMetrics()} />);
    expect(screen.getAllByText(/In:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Out:/i).length).toBeGreaterThan(0);
  });
});
