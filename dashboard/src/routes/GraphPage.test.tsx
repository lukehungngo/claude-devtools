import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { RepoGroup, SessionInfo, AgentDAG, AgentLogEntry } from "../lib/types";
import type { GraphSessionState } from "../hooks/useGraphSession";

// gsap must be mocked for jsdom (AgentGraph imports it).
vi.mock("gsap", () => ({
  default: {
    set: vi.fn(),
    to: vi.fn(),
    from: vi.fn(),
    timeline: () => ({
      from: vi.fn().mockReturnThis(),
      to: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(),
      kill: vi.fn(),
    }),
  },
}));

const useReposMock = vi.fn();
vi.mock("../hooks/useRepos", () => ({
  useRepos: () => useReposMock(),
}));

const useGraphSessionMock = vi.fn();
vi.mock("../hooks/useGraphSession", () => ({
  useGraphSession: (...args: unknown[]) => useGraphSessionMock(...args),
}));

const useAgentLogsMock = vi.fn();
vi.mock("../hooks/useAgentLogs", () => ({
  useAgentLogs: (...args: unknown[]) => useAgentLogsMock(...args),
}));

import { GraphPage } from "./GraphPage";

const tokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
};

const dag: AgentDAG = {
  nodes: [
    { id: "main", type: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "active" },
    { id: "agent_a", type: "engineer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
  ],
  edges: [{ source: "main", target: "agent_a" }],
};

const session = (over: Partial<SessionInfo>): SessionInfo => ({
  id: "sess",
  projectHash: "hA",
  path: "/p",
  startTime: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  eventCount: 1,
  subagentCount: 0,
  ...over,
});

const repo = (over: Partial<RepoGroup>): RepoGroup => ({
  cwd: "/repo",
  repoName: "alpha",
  sessions: [],
  lastActive: new Date().toISOString(),
  hasActiveSessions: false,
  ...over,
});

const logEntry = (preview: string): AgentLogEntry => ({
  timestamp: new Date().toISOString(),
  eventType: "assistant",
  agentId: "agent_a",
  contentPreview: preview,
  uuid: `u-${preview}`,
});

const graphState = (over: Partial<GraphSessionState> = {}): GraphSessionState => ({
  dagForTurn: dag,
  runningAgentIds: new Set(["main"]),
  lastTurn: { turnNumber: 1 } as never,
  events: [],
  liveEventCount: 0,
  loading: false,
  ...over,
});

beforeEach(() => {
  useReposMock.mockReset();
  useGraphSessionMock.mockReset();
  useAgentLogsMock.mockReset();
  useAgentLogsMock.mockReturnValue({ logs: [], loading: false });
  useGraphSessionMock.mockReturnValue(graphState());
});

afterEach(cleanup);

describe("GraphPage", () => {
  it("auto-selects the most-recently-active session and passes it to useGraphSession", () => {
    const older = session({ id: "old-1", projectHash: "hA", isActive: true, startTime: new Date(Date.now() - 100_000).toISOString() });
    const newerActive = session({ id: "new-1", projectHash: "hB", isActive: true, startTime: new Date(Date.now() - 1_000).toISOString() });
    useReposMock.mockReturnValue({
      repos: [repo({ sessions: [older, newerActive] })],
      loading: false,
      refresh: vi.fn(),
    });

    render(<GraphPage />);
    expect(useGraphSessionMock).toHaveBeenCalledWith("hB", "new-1");
  });

  it("falls back to the most-recent session overall when none are active", () => {
    const a = session({ id: "a-1", projectHash: "hA", startTime: new Date(Date.now() - 100_000).toISOString() });
    const b = session({ id: "b-1", projectHash: "hB", startTime: new Date(Date.now() - 1_000).toISOString() });
    useReposMock.mockReturnValue({
      repos: [repo({ sessions: [a, b] })],
      loading: false,
      refresh: vi.fn(),
    });

    render(<GraphPage />);
    expect(useGraphSessionMock).toHaveBeenCalledWith("hB", "b-1");
  });

  it("renders the graph nodes for the selected session", () => {
    useReposMock.mockReturnValue({
      repos: [repo({ sessions: [session({ id: "s1", projectHash: "hA", isActive: true })] })],
      loading: false,
      refresh: vi.fn(),
    });
    render(<GraphPage />);
    expect(screen.getByTestId("agent-graph-node-main")).toBeTruthy();
    expect(screen.getByTestId("agent-graph-node-agent_a")).toBeTruthy();
  });

  it("clicking a node shows that agent's detail (last lines)", () => {
    useReposMock.mockReturnValue({
      repos: [repo({ sessions: [session({ id: "s1", projectHash: "hA", isActive: true })] })],
      loading: false,
      refresh: vi.fn(),
    });
    useAgentLogsMock.mockReturnValue({ logs: [logEntry("hello from agent_a")], loading: false });

    render(<GraphPage />);
    // Before selecting: empty state.
    expect(screen.getByTestId("agent-detail-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("agent-graph-node-agent_a"));

    expect(screen.getByTestId("agent-detail-panel")).toBeTruthy();
    expect(screen.getByTestId("agent-detail-line").textContent).toContain("hello from agent_a");
  });

  it("shows a no-session empty state when there are no sessions", () => {
    useReposMock.mockReturnValue({ repos: [], loading: false, refresh: vi.fn() });
    render(<GraphPage />);
    expect(screen.getByTestId("graph-no-session")).toBeTruthy();
  });
});
