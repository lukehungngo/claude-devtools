import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AgentLogEntry } from "../../lib/types";

const useAgentLogsMock = vi.fn();
vi.mock("../../hooks/useAgentLogs", () => ({
  useAgentLogs: (...args: unknown[]) => useAgentLogsMock(...args),
}));

// Mock GSAP so jsdom doesn't run real timelines; the panel under test renders
// the log regardless of animation.
vi.mock("gsap", () => ({ default: { registerPlugin: vi.fn(), from: vi.fn(), to: vi.fn() } }));
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));

import { AgentDetailPanel } from "./AgentDetailPanel";

const entry = (i: number, content: string): AgentLogEntry => ({
  timestamp: `2026-05-29T00:00:${String(i).padStart(2, "0")}Z`,
  eventType: "assistant",
  agentId: "main",
  contentPreview: content.slice(0, 120),
  content,
  uuid: `u${i}`,
});

beforeEach(() => {
  useAgentLogsMock.mockReset();
  useAgentLogsMock.mockReturnValue({ logs: [], loading: false });
});

afterEach(cleanup);

describe("AgentDetailPanel", () => {
  it("renders ALL log lines (no 5-line cap), in order", () => {
    const logs = [1, 2, 3, 4, 5, 6, 7].map((i) => entry(i, `line ${i}`));
    useAgentLogsMock.mockReturnValue({ logs, loading: false });

    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" />);

    const lines = screen.getAllByTestId("agent-detail-line");
    expect(lines.length).toBe(7); // full log, not capped
    expect(lines[0].textContent).toContain("line 1");
    expect(lines[6].textContent).toContain("line 7");
  });

  it("renders the FULL untruncated content of a line", () => {
    const long = "X".repeat(400) + "\nsecond line";
    useAgentLogsMock.mockReturnValue({ logs: [entry(1, long)], loading: false });

    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" />);

    const line = screen.getByTestId("agent-detail-line");
    expect(line.textContent).toContain("X".repeat(400));
    expect(line.textContent).toContain("second line");
  });

  it("renders markdown (bold + GFM table) instead of raw syntax", () => {
    const md = "**Headline** text\n\n| A | B |\n|---|---|\n| 1 | 2 |";
    useAgentLogsMock.mockReturnValue({ logs: [entry(1, md)], loading: false });
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" />);

    const line = screen.getByTestId("agent-detail-line");
    expect(line.querySelector("strong")?.textContent).toBe("Headline");
    expect(line.querySelector("table")).not.toBeNull();
    expect(line.querySelector("td")?.textContent).toBe("1");
    // raw markdown syntax must NOT show as literal text
    expect(line.textContent).not.toContain("**Headline**");
    expect(line.textContent).not.toContain("|---|");
  });

  it("shows the line count in the header", () => {
    const logs = [1, 2, 3].map((i) => entry(i, `line ${i}`));
    useAgentLogsMock.mockReturnValue({ logs, loading: false });
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" />);
    expect(screen.getByText("3 lines")).toBeTruthy();
  });

  it("shows a live indicator when live=true", () => {
    useAgentLogsMock.mockReturnValue({ logs: [entry(1, "x")], loading: false });
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId="main" live />);
    expect(screen.getByTestId("agent-detail-live")).toBeTruthy();
  });

  it("shows an empty state (no '5') when agentId is null", () => {
    render(<AgentDetailPanel projectHash="hA" sessionId="s1" agentId={null} />);
    const empty = screen.getByTestId("agent-detail-empty");
    expect(empty.textContent).toMatch(/select an agent/i);
    expect(empty.textContent).toMatch(/live log/i);
    expect(empty.textContent).not.toMatch(/\b5\b/);
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
