import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useInsightsTrends } from "./useInsightsTrends";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MOCK_TRENDS = {
  commands: [{ name: "/review", calls: 3, avgIn: 100, avgOut: 50, weekly: [{ in: 100, out: 50 }], verdict: "stable" }],
  agents: [{ name: "engineer", calls: 2, avgIn: 500, avgOut: 200, weekly: [{ in: 500, out: 200 }], verdict: "improving" }],
  skills: [{ name: "verification", calls: 5, avgIn: 200, avgOut: 100, weekly: [{ in: 200, out: 100 }], verdict: "stable" }],
};

describe("useInsightsTrends", () => {
  it("returns loading=true initially", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_TRENDS), { status: 200 })
    );
    const { result } = renderHook(() => useInsightsTrends("7d", "all"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("populates data with commands/agents/skills", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_TRENDS), { status: 200 })
    );
    const { result } = renderHook(() => useInsightsTrends("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.commands[0].name).toBe("/review");
    expect(result.current.data?.agents[0].name).toBe("engineer");
    expect(result.current.data?.skills[0].name).toBe("verification");
  });

  it("fetches /api/insights/trends", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_TRENDS), { status: 200 })
    );
    renderHook(() => useInsightsTrends("7d", "all"));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toContain("/api/insights/trends");
  });

  it("sets error on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useInsightsTrends("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("sets error on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "server error" }), { status: 500 })
    );
    const { result } = renderHook(() => useInsightsTrends("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });
});
