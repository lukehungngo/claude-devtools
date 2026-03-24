import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentLogs } from "./useAgentLogs";

describe("useAgentLogs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ events: [{ type: "user", uuid: "1" }] }),
      })
    );
  });

  it("fetches logs on mount when projectHash and sessionId are provided", async () => {
    renderHook(() => useAgentLogs("hash1", "sess1", "agent1"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/hash1/sess1/events/agent1"
    );
  });

  it("does not fetch when projectHash is null", () => {
    renderHook(() => useAgentLogs(null, "sess1", "agent1"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fetch when sessionId is null", () => {
    renderHook(() => useAgentLogs("hash1", null, "agent1"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does NOT use setInterval for polling", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    renderHook(() => useAgentLogs("hash1", "sess1", "agent1"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refetches when liveEventCount changes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(
      ({ count }: { count: number }) =>
        useAgentLogs("hash1", "sess1", "agent1", count),
      { initialProps: { count: 0 } }
    );

    // Initial fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Simulate live events arriving
    await act(async () => {
      rerender({ count: 5 });
    });

    // Should have refetched
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("populates logs from fetch response", async () => {
    const { result } = renderHook(() =>
      useAgentLogs("hash1", "sess1", "agent1")
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].uuid).toBe("1");
  });

  it("clears logs when session changes to null", async () => {
    const { result, rerender } = renderHook(
      ({ sid }: { sid: string | null }) => useAgentLogs("hash1", sid, "agent1"),
      { initialProps: { sid: "sess1" as string | null } }
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.logs).toHaveLength(1);

    rerender({ sid: null });
    expect(result.current.logs).toHaveLength(0);
  });
});
