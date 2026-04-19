import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useInsightsBreakdown } from "./useInsightsBreakdown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MOCK_BREAKDOWN = {
  models: [{ model: "claude-sonnet-4-6", tokensIn: 1000, tokensOut: 500, cost: 0.005, turns: 2, share: 100 }],
  topRepos: [{ slug: "/project", tokens: 1500, cost: 0.005 }],
  topSessions: [{ id: "s1", label: "project · 2026-04-19", cost: 0.005 }],
  topTools: [{ name: "Read", calls: 10 }],
};

describe("useInsightsBreakdown", () => {
  it("returns loading=true initially", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_BREAKDOWN), { status: 200 })
    );
    const { result } = renderHook(() => useInsightsBreakdown("7d", "all"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches from /api/insights/breakdown with correct params", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_BREAKDOWN), { status: 200 })
    );
    const { result } = renderHook(() => useInsightsBreakdown("30d", "/my/project"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/insights/breakdown?timeRange=30d")
    );
  });

  it("populates data on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_BREAKDOWN), { status: 200 })
    );
    const { result } = renderHook(() => useInsightsBreakdown("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.models).toHaveLength(1);
    expect(result.current.data?.models[0].model).toBe("claude-sonnet-4-6");
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useInsightsBreakdown("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it("sets error on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "bad" }), { status: 500 })
    );
    const { result } = renderHook(() => useInsightsBreakdown("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("refetches when timeRange changes", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_BREAKDOWN), { status: 200 })
    );
    const { rerender } = renderHook(
      ({ tr }: { tr: string }) => useInsightsBreakdown(tr as "7d" | "30d", "all"),
      { initialProps: { tr: "7d" } }
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender({ tr: "30d" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
