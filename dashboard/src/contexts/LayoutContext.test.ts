import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { useLayoutContext, LayoutContext } from "./LayoutContext";
import type { LayoutContextValue } from "./LayoutContext";

describe("LayoutContext", () => {
  it("useLayoutContext throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useLayoutContext());
    }).toThrow("useLayoutContext must be used within LayoutContext.Provider");
  });

  it("useLayoutContext returns context value when inside provider", () => {
    const mockValue: LayoutContextValue = {
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
      requestedRightTab: undefined,
      setRequestedRightTab: () => {},
      rightPanelContent: null,
      setRightPanelContent: () => {},
      questions: [],
      submitAnswer: async () => {},
      activeSessionId: null,
      setActiveSessionId: () => {},
      selected: null,
      setSelected: () => {},
      slugMap: new Map(),
      reverseSlugMap: new Map(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(LayoutContext.Provider, { value: mockValue }, children);

    const { result } = renderHook(() => useLayoutContext(), { wrapper });
    expect(result.current).toBe(mockValue);
    expect(result.current.repos).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });
});
