import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { WorkflowSummary, WorkflowAgentSummary } from "../../lib/types";

vi.mock("gsap", () => ({ default: { from: vi.fn(), registerPlugin: vi.fn() } }));
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));

import { WorkflowTable } from "./WorkflowTable";

const tokens = { inputTokens: 1200, outputTokens: 340, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 };
function agent(over: Partial<WorkflowAgentSummary>): WorkflowAgentSummary {
  return {
    agentId: "a1",
    label: "an agent",
    phase: null,
    status: "finished",
    model: "claude-opus-4-8",
    tokens,
    toolCalls: 5,
    mcpToolCalls: 0,
    resultSummary: null,
    ...over,
  };
}

afterEach(cleanup);

describe("WorkflowTable", () => {
  it("shows an empty state when there are no workflows", () => {
    render(<WorkflowTable workflows={[]} />);
    expect(screen.getByTestId("workflow-table-empty")).toBeTruthy();
  });

  it("renders a workflow card with its agents, model, and tool counts", () => {
    const wf: WorkflowSummary = {
      id: "wf_abc123",
      tokens: { inputTokens: 5000, outputTokens: 1200, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
      durationMs: 230_000,
      agentCount: 2,
      running: 1,
      finished: 1,
      phases: null,
      agents: [
        agent({ agentId: "a1", label: "research sdk", status: "finished", model: "claude-opus-4-8", toolCalls: 17 }),
        agent({ agentId: "a2", label: "review code", status: "running", model: "claude-sonnet-4-6", toolCalls: 3 }),
      ],
    };
    render(<WorkflowTable workflows={[wf]} />);
    expect(screen.getByTestId("workflow-wf_abc123")).toBeTruthy();
    expect(screen.getByTestId("workflow-agent-a1").textContent).toContain("research sdk");
    // model shortened
    expect(screen.getByTestId("workflow-agent-a1").textContent).toContain("Opus 4.8");
    expect(screen.getByTestId("workflow-agent-a2").textContent).toContain("Sonnet 4.6");
    // running agent reflected
    expect(screen.getByTestId("workflow-agent-a2").getAttribute("data-status")).toBe("running");
  });

  it("groups agents under phase titles when phases are present", () => {
    const wf: WorkflowSummary = {
      id: "wf_ph",
      tokens,
      durationMs: null,
      agentCount: 2,
      running: 0,
      finished: 2,
      phases: ["Diagnose", "Fix"],
      agents: [
        agent({ agentId: "b1", label: "diag", phase: "Diagnose" }),
        agent({ agentId: "b2", label: "fix", phase: "Fix" }),
      ],
    };
    render(<WorkflowTable workflows={[wf]} />);
    const card = screen.getByTestId("workflow-wf_ph");
    expect(card.textContent).toContain("Diagnose");
    expect(card.textContent).toContain("Fix");
  });

  it("shows total tokens and a formatted duration in the workflow header", () => {
    const wf: WorkflowSummary = {
      id: "wf_tot",
      tokens: { inputTokens: 12_000, outputTokens: 3000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
      durationMs: 69_000, // 1m09s
      agentCount: 1,
      running: 0,
      finished: 1,
      phases: null,
      agents: [agent({ agentId: "a1" })],
    };
    render(<WorkflowTable workflows={[wf]} />);
    const totals = screen.getByTestId("workflow-totals-wf_tot");
    expect(totals.textContent).toContain("12K"); // total input tokens (formatTokens rounds to K)
    expect(totals.textContent).toContain("3K"); // total output tokens
    expect(totals.textContent).toContain("1m09s"); // duration
  });

  it("omits the duration when durationMs is null", () => {
    const wf: WorkflowSummary = {
      id: "wf_nodur",
      tokens: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
      durationMs: null,
      agentCount: 1,
      running: 0,
      finished: 1,
      phases: null,
      agents: [agent({ agentId: "a1" })],
    };
    render(<WorkflowTable workflows={[wf]} />);
    // tokens still shown, but no duration clock value
    expect(screen.getByTestId("workflow-totals-wf_nodur")).toBeTruthy();
    expect(screen.getByTestId("workflow-totals-wf_nodur").textContent).not.toMatch(/\d+m\d+s|\d+s\b/);
  });

  it("renders the result summary when present", () => {
    const wf: WorkflowSummary = {
      id: "wf_r",
      tokens,
      durationMs: 5000,
      agentCount: 1,
      running: 0,
      finished: 1,
      phases: null,
      agents: [agent({ agentId: "a1", resultSummary: "Found 3 issues in the parser" })],
    };
    render(<WorkflowTable workflows={[wf]} />);
    expect(screen.getByTestId("workflow-agent-a1").textContent).toContain("Found 3 issues in the parser");
  });
});
