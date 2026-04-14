import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentLogs } from "./useAgentLogs";

describe("useAgentLogs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
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

  it("non-2xx response keeps logs empty (does not accept poisoned body)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            events: [{ type: "user", uuid: "injected" }],
          }),
      })
    );

    const { result } = renderHook(() =>
      useAgentLogs("hash1", "sess1", "agent1")
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.logs).toHaveLength(0);
  });

  it("refetches with correct agentId when agentId and liveEventCount both change", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(
      ({ agentId, count }: { agentId: string; count: number }) =>
        useAgentLogs("hash1", "sess1", agentId, count),
      { initialProps: { agentId: "agent-a", count: 0 } }
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const firstCall = mockFetch.mock.calls[0][0];
    expect(firstCall).toContain("agent-a");

    // Change agentId AND increment liveEventCount in same render
    await act(async () => {
      rerender({ agentId: "agent-b", count: 1 });
      await new Promise((r) => setTimeout(r, 10));
    });

    // The refetch caused by liveEventCount change must use agent-b, not agent-a
    const lastCall =
      mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0];
    expect(lastCall).toContain("agent-b");
    expect(lastCall).not.toContain("agent-a");
  });
});
