import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { SessionEvent, SessionMetrics, AgentDAG } from "../lib/types";
import type { SessionWsHandlers, LayoutContextValue } from "../contexts/LayoutContext";

// ── Mocks ────────────────────────────────────────────────────────────
const refreshSpy = vi.fn();
const useSessionMetricsMock = vi.fn();
vi.mock("./useSessionData", () => ({
  useSessionMetrics: (...args: unknown[]) => useSessionMetricsMock(...args),
}));

// Capture the handlers registered by the hook.
let registeredHandlers: SessionWsHandlers | null = null;
const registerSessionHandlers = vi.fn((h: SessionWsHandlers | null) => {
  registeredHandlers = h;
});

import { LayoutContext } from "../contexts/LayoutContext";
import { useGraphSession } from "./useGraphSession";

function wrapper({ children }: { children: ReactNode }) {
  const ctx = { registerSessionHandlers } as unknown as LayoutContextValue;
  return createElement(LayoutContext.Provider, { value: ctx }, children);
}

const tokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
};

// A FULL session dag spanning multiple turns' worth of agents.
const dag: AgentDAG = {
  nodes: [
    { id: "main", type: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "active" },
    { id: "agent_a", type: "engineer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
    { id: "agent_b", type: "reviewer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
    { id: "agent_c", type: "general-purpose", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "active" },
  ],
  edges: [
    { source: "main", target: "agent_a" },
    { source: "main", target: "agent_b" },
    { source: "main", target: "agent_c" },
  ],
};

const events: SessionEvent[] = [{ type: "user" } as unknown as SessionEvent];
const metrics = { dag } as unknown as SessionMetrics;

beforeEach(() => {
  vi.useFakeTimers();
  registeredHandlers = null;
  refreshSpy.mockReset();
  registerSessionHandlers.mockClear();
  useSessionMetricsMock.mockReturnValue({
    metrics,
    events,
    subagentMeta: {},
    loading: false,
    refresh: refreshSpy,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useGraphSession", () => {
  it("exposes the FULL session dag (every agent, not just one turn)", () => {
    const { result } = renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    // All 4 nodes — main + 3 agents across the session — are present.
    expect(result.current.dag).toBe(dag);
    expect(result.current.dag?.nodes.length).toBe(4);
    expect(result.current.liveEventCount).toBe(events.length);
  });

  it("derives runningAgentIds from active nodes only", () => {
    const { result } = renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    expect(result.current.runningAgentIds.has("main")).toBe(true);
    expect(result.current.runningAgentIds.has("agent_c")).toBe(true);
    expect(result.current.runningAgentIds.has("agent_a")).toBe(false);
    expect(result.current.runningAgentIds.has("agent_b")).toBe(false);
  });

  it("registers a WS handler for the selected session", () => {
    renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    expect(registerSessionHandlers).toHaveBeenCalled();
    expect(registeredHandlers).not.toBeNull();
  });

  it("debounces refresh after onNewEvents for the selected session", () => {
    renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    expect(registeredHandlers).not.toBeNull();

    act(() => {
      registeredHandlers?.onNewEvents("s1", "/path.jsonl", [{ type: "assistant" } as unknown as SessionEvent]);
    });
    expect(refreshSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores onNewEvents for a different session", () => {
    renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    act(() => {
      registeredHandlers?.onNewEvents("OTHER", "/path.jsonl", [{ type: "assistant" } as unknown as SessionEvent]);
      vi.advanceTimersByTime(2000);
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("deregisters the WS handler on unmount", () => {
    const { unmount } = renderHook(() => useGraphSession("hA", "s1"), { wrapper });
    registerSessionHandlers.mockClear();
    unmount();
    expect(registerSessionHandlers).toHaveBeenCalledWith(null);
  });

  it("returns a null dag when no session is selected", () => {
    useSessionMetricsMock.mockReturnValue({
      metrics: null,
      events: [],
      subagentMeta: {},
      loading: false,
      refresh: refreshSpy,
    });
    const { result } = renderHook(() => useGraphSession(null, null), { wrapper });
    expect(result.current.dag).toBeNull();
    expect(result.current.runningAgentIds.size).toBe(0);
  });
});
