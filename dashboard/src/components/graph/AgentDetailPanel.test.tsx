import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AgentLogEntry } from "../../lib/types";

const useAgentLogsMock = vi.fn();
vi.mock("../../hooks/useAgentLogs", () => ({
  useAgentLogs: (...args: unknown[]) => useAgentLogsMock(...args),
}));

import { AgentDetailPanel } from "./AgentDetailPanel";

const entry = (i: number, preview: string): AgentLogEntry => ({
  timestamp: `2026-05-29T00:00:${String(i).padStart(2, "0")}Z`,
  eventType: "assistant",
  agentId: "main",
  contentPreview: preview,
  uuid: `u${i}`,
});

beforeEach(() => {
  useAgentLogsMock.mockReset();
  useAgentLogsMock.mockReturnValue({ logs: [], loading: false });
});

afterEach(cleanup);

describe("AgentDetailPanel", () => {
  it("renders exactly the last 5 emitted lines, newest last", () => {
    const logs = [1, 2, 3, 4, 5, 6, 7].map((i) => entry(i, `line ${i}`));
    useAgentLogsMock.mockReturnValue({ logs, loading: false });

    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" />);

    const lines = screen.getAllByTestId("agent-detail-line");
    expect(lines.length).toBe(5);
    expect(lines[0].textContent).toContain("line 3");
    expect(lines[4].textContent).toContain("line 7");
  });

  it("shows an empty state when agentId is null", () => {
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId={null} />);
    expect(screen.getByTestId("agent-detail-empty").textContent).toMatch(/select an agent/i);
  });

  it("passes projectHash, sessionId, agentId and liveEventCount to useAgentLogs", () => {
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" liveEventCount={42} />);
    expect(useAgentLogsMock).toHaveBeenCalledWith("hA", "s1", "main", 42);
  });

  it("refetches (hook called with new count) when liveEventCount changes", () => {
    const { rerender } = render(
      <AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" liveEventCount={1} />,
    );
    expect(useAgentLogsMock).toHaveBeenLastCalledWith("hA", "s1", "main", 1);

    rerender(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" liveEventCount={2} />);
    expect(useAgentLogsMock).toHaveBeenLastCalledWith("hA", "s1", "main", 2);
  });
});
