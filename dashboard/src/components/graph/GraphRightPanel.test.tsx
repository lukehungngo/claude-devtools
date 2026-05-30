import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { WorkflowSummary } from "../../lib/types";

vi.mock("./AgentDetailPanel", () => ({
  AgentDetailPanel: ({ agentId }: { agentId: string | null }) => (
    <div data-testid="mock-log">log:{agentId ?? "none"}</div>
  ),
}));
vi.mock("./WorkflowTable", () => ({
  WorkflowTable: ({ workflows }: { workflows: WorkflowSummary[] }) => (
    <div data-testid="mock-wf">wf:{workflows.length}</div>
  ),
}));

import { GraphRightPanel } from "./GraphRightPanel";

const wf = (id: string): WorkflowSummary => ({
  id,
  tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
  durationMs: null,
  agentCount: 1,
  running: 0,
  finished: 1,
  phases: null,
  agents: [],
});

const baseProps = {
  projectHash: "h",
  sessionId: "s",
  agentId: null,
  liveEventCount: 0,
  live: false,
  workflows: [] as WorkflowSummary[],
};

afterEach(cleanup);

describe("GraphRightPanel", () => {
  it("defaults to the Log tab", () => {
    render(<GraphRightPanel {...baseProps} agentId="a1" />);
    expect(screen.getByTestId("mock-log")).toBeTruthy();
    expect(screen.queryByTestId("mock-wf")).toBeNull();
    expect(screen.getByTestId("graph-tab-log").getAttribute("aria-selected")).toBe("true");
  });

  it("switches to the Workflows tab on click", () => {
    render(<GraphRightPanel {...baseProps} workflows={[wf("wf_1"), wf("wf_2")]} />);
    fireEvent.click(screen.getByTestId("graph-tab-workflows"));
    expect(screen.getByTestId("mock-wf").textContent).toBe("wf:2");
    expect(screen.queryByTestId("mock-log")).toBeNull();
    expect(screen.getByTestId("graph-tab-workflows").getAttribute("aria-selected")).toBe("true");
  });

  it("shows a count badge on the Workflows tab", () => {
    render(<GraphRightPanel {...baseProps} workflows={[wf("wf_1")]} />);
    expect(screen.getByTestId("graph-tab-workflows").textContent).toContain("1");
  });
});
