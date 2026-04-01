import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { useLayoutContext, LayoutContext } from "./LayoutContext";
import type { LayoutContextValue } from "./LayoutContext";

/** Minimal mock that satisfies the full LayoutContextValue interface */
function createMockContextValue(overrides?: Partial<LayoutContextValue>): LayoutContextValue {
  return {
    repos: [],
    reposLoading: false,
    refreshRepos: () => {},
    permissions: [],
    decidePermission: async () => {},
    decidePermissionSession: async () => {},
    usage: null,
    costs: null,
    isLive: false,
    registerSessionHandlers: () => {},
    currentMetrics: null,
    setCurrentMetrics: () => {},
    toolFilter: null,
    setToolFilter: () => {},
    questions: [],
    submitAnswer: async () => {},
    activeSessionId: null,
    setActiveSessionId: () => {},
    selected: null,
    setSelected: () => {},
    slugMap: new Map(),
    reverseSlugMap: new Map(),
    // Session data fields for BottomPanel wiring
    currentEvents: [],
    currentLiveEvents: [],
    currentTurns: [],
    currentDag: null,
    currentActiveTurnIndex: null,
    currentSelectedAgent: null,
    setCurrentSelectedAgent: () => {},
    setCurrentEvents: () => {},
    setCurrentLiveEvents: () => {},
    setCurrentTurns: () => {},
    setCurrentDag: () => {},
    setCurrentActiveTurnIndex: () => {},
    hasSubagents: false,
    setHasSubagents: () => {},
    viewingTurnNumber: undefined,
    setViewingTurnNumber: () => {},
    turnHistoryOpen: true,
    setTurnHistoryOpen: () => {},
    onClearViewingTurnRef: { current: null },
    onTurnClickRef: { current: null },
    openBottomTabRef: { current: null },
    ...overrides,
  };
}

describe("LayoutContext", () => {
  it("useLayoutContext throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useLayoutContext());
    }).toThrow("useLayoutContext must be used within LayoutContext.Provider");
  });

  it("useLayoutContext returns context value when inside provider", () => {
    const mockValue = createMockContextValue();

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(LayoutContext.Provider, { value: mockValue }, children);

    const { result } = renderHook(() => useLayoutContext(), { wrapper });
    expect(result.current).toBe(mockValue);
    expect(result.current.repos).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });

  it("exposes session data fields with correct defaults for BottomPanel wiring", () => {
    const mockValue = createMockContextValue();

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(LayoutContext.Provider, { value: mockValue }, children);

    const { result } = renderHook(() => useLayoutContext(), { wrapper });

    // Verify all new session data fields exist with correct default values
    expect(result.current.currentEvents).toEqual([]);
    expect(result.current.currentLiveEvents).toEqual([]);
    expect(result.current.currentTurns).toEqual([]);
    expect(result.current.currentDag).toBeNull();
    expect(result.current.currentActiveTurnIndex).toBeNull();
    expect(result.current.currentSelectedAgent).toBeNull();
    expect(result.current.hasSubagents).toBe(false);

    // Verify setters are functions
    expect(typeof result.current.setCurrentEvents).toBe("function");
    expect(typeof result.current.setCurrentLiveEvents).toBe("function");
    expect(typeof result.current.setCurrentTurns).toBe("function");
    expect(typeof result.current.setCurrentDag).toBe("function");
    expect(typeof result.current.setCurrentActiveTurnIndex).toBe("function");
    expect(typeof result.current.setCurrentSelectedAgent).toBe("function");
    expect(typeof result.current.setHasSubagents).toBe("function");
  });
});
