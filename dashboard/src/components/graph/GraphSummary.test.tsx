import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { AgentDAG, AgentNode } from "../../lib/types";

vi.mock("gsap", () => ({ default: { from: vi.fn(), registerPlugin: vi.fn() } }));
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));

import { GraphSummary } from "./GraphSummary";

const tokens = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 };
function node(id: string, type: string, status: AgentNode["status"]): AgentNode {
  return { id, type, tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status };
}

const dag: AgentDAG = {
  nodes: [
    node("main", "main", "active"),
    node("a1", "engineer", "completed"),
    node("a2", "engineer", "completed"),
    node("a3", "reviewer", "error"),
  ],
  edges: [],
};

afterEach(cleanup);

describe("GraphSummary", () => {
  it("shows total, running, finished, and errored counts", () => {
    render(<GraphSummary dag={dag} runningAgentIds={new Set(["main"])} />);
    expect(screen.getByTestId("graph-summary-total").textContent).toBe("4");
    expect(screen.getByTestId("graph-summary-running").textContent).toContain("1");
    // a1, a2 (completed) → 2 finished; a3 (error) surfaced separately
    expect(screen.getByTestId("graph-summary-finished").textContent).toContain("2");
    expect(screen.getByTestId("graph-summary-errored").textContent).toContain("1");
  });

  it("lists per-type counts", () => {
    render(<GraphSummary dag={dag} runningAgentIds={new Set(["main"])} />);
    const types = screen.getByTestId("graph-summary-types");
    expect(types.textContent).toContain("engineer");
    expect(types.textContent).toContain("reviewer");
    expect(types.textContent).toContain("Main");
  });

  it("collapses and expands the body when the header is toggled", () => {
    render(<GraphSummary dag={dag} runningAgentIds={new Set(["main"])} />);
    expect(screen.getByTestId("graph-summary-types")).toBeTruthy();
    fireEvent.click(screen.getByTestId("graph-summary-toggle"));
    expect(screen.queryByTestId("graph-summary-types")).toBeNull();
    fireEvent.click(screen.getByTestId("graph-summary-toggle"));
    expect(screen.getByTestId("graph-summary-types")).toBeTruthy();
  });
});
