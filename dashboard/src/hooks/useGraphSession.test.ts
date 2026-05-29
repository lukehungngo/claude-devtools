import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { SessionEvent, SessionMetrics, AgentDAG, SubagentMeta } from "../lib/types";
import type { TurnSnapshot } from "../lib/turnSnapshot";
import type { SessionWsHandlers, LayoutContextValue } from "../contexts/LayoutContext";

// ── Mocks ────────────────────────────────────────────────────────────
const refreshSpy = vi.fn();
const useSessionMetricsMock = vi.fn();
vi.mock("./useSessionData", () => ({
  useSessionMetrics: (...args: unknown[]) => useSessionMetricsMock(...args),
}));

const groupEventsIntoTurnsMock = vi.fn();
vi.mock("../lib/turnSnapshot", () => ({
  groupEventsIntoTurns: (...args: unknown[]) => groupEventsIntoTurnsMock(...args),
}));

const filterDagForTurnMock = vi.fn();
vi.mock("../lib/filterDagForTurn", () => ({
  filterDagForTurn: (...args: unknown[]) => filterDagForTurnMock(...args),
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

const dag: AgentDAG = {
  nodes: [
    { id: "main", type: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "active" },
    { id: "agent_a", type: "engineer", parentId: "main", tokenUsage: tokens, toolCalls: 0, mcpToolCalls: 0, status: "completed" },
  ],
  edges: [{ source: "main", target: "agent_a" }],
};

const turn1 = { turnNumber: 1 } as unknown as TurnSnapshot;
const turn2 = { turnNumber: 2 } as unknown as TurnSnapshot;

const events: SessionEvent[] = [{ type: "user" } as unknown as SessionEvent];
const subagentMeta: SubagentMeta = {};
const metrics = { dag } as unknown as SessionMetrics;

beforeEach(() => {
  vi.useFakeTimers();
  registeredHandlers = null;
  refreshSpy.mockReset();
  registerSessionHandlers.mockClear();
  useSessionMetricsMock.mockReturnValue({
    metrics,
    events,
    subagentMeta,
    loading: false,
    refresh: refreshSpy,
  });
  groupEventsIntoTurnsMock.mockReturnValue([turn1, turn2]);
  // filterDagForTurn returns the full dag (both nodes) for the test.
  filterDagForTurnMock.mockReturnValue(dag);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useGraphSession", () => {
  it("derives lastTurn, dagForTurn and runningAgentIds (active nodes only)", () => {
    const { result } = renderHook(() => useGraphSession("hA", "s1"), { wrapper });

    expect(result.current.lastTurn).toBe(turn2);
    expect(filterDagForTurnMock).toHaveBeenCalledWith(dag, turn2);
    expect(result.current.dagForTurn).toBe(dag);
    expect(result.current.runningAgentIds.has("main")).toBe(true);
    expect(result.current.runningAgentIds.has("agent_a")).toBe(false);
    expect(result.current.liveEventCount).toBe(events.length);
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
    // Not called immediately (debounced).
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

  it("returns null dag/turn when no session is selected", () => {
    useSessionMetricsMock.mockReturnValue({
      metrics: null,
      events: [],
      subagentMeta: {},
      loading: false,
      refresh: refreshSpy,
    });
    groupEventsIntoTurnsMock.mockReturnValue([]);
    filterDagForTurnMock.mockReturnValue(null);

    const { result } = renderHook(() => useGraphSession(null, null), { wrapper });
    expect(result.current.lastTurn).toBeNull();
    expect(result.current.dagForTurn).toBeNull();
    expect(result.current.runningAgentIds.size).toBe(0);
  });
});
