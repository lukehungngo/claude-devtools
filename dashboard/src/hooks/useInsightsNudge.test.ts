import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInsightsNudge, safeWriteInsightsLastClick } from "./useInsightsNudge";

const KEY = "cdt:insights-last-click";

// Stable mock for @tanstack/react-router useLocation
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: globalMockPathname }),
}));

let globalMockPathname = "/";

describe("useInsightsNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    globalMockPathname = "/";
  });

  it("returns nudgeActive=true when localStorage key is absent", () => {
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(true);
  });

  it("returns nudgeActive=true when timestamp is 4 days old", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, fourDaysAgo);
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(true);
  });

  it("returns nudgeActive=false when timestamp is 2 days old", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, twoDaysAgo);
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(false);
  });

  it("returns nudgeActive=false on /insights regardless of timestamp", () => {
    globalMockPathname = "/insights";
    // No localStorage entry → would normally be true, but we're on the page
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(false);
  });

  it("returns nudgeActive=true when localStorage.getItem throws", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      const { result } = renderHook(() => useInsightsNudge());
      expect(result.current.nudgeActive).toBe(true);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});

describe("safeWriteInsightsLastClick", () => {
  beforeEach(() => localStorage.clear());

  it("writes an ISO timestamp to localStorage", () => {
    safeWriteInsightsLastClick();
    const raw = localStorage.getItem(KEY);
    expect(raw).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("does not throw when setItem throws", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("quota"); };
    try {
      expect(() => safeWriteInsightsLastClick()).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
