import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSessionControl } from "./useSessionControl";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSessionControl", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useSessionControl("session-1"));

    expect(result.current.model).toBeNull();
    expect(result.current.fastMode).toBe(false);
    expect(result.current.effort).toBe("high");
  });

  it("setModel calls correct endpoint and updates state", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    await act(async () => {
      await result.current.setModel("claude-sonnet-4-20250514");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/model",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514" }),
      }
    );
    expect(result.current.model).toBe("claude-sonnet-4-20250514");
  });

  it("toggleFastMode calls correct endpoint and toggles state", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    // Initially false, toggle to true
    await act(async () => {
      await result.current.toggleFastMode();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/fast",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(result.current.fastMode).toBe(true);

    // Toggle back to false
    await act(async () => {
      await result.current.toggleFastMode();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/sessions/session-1/fast",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }
    );
    expect(result.current.fastMode).toBe(false);
  });

  it("setEffort calls correct endpoint and updates state", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    await act(async () => {
      await result.current.setEffort("low");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/effort",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "low" }),
      }
    );
    expect(result.current.effort).toBe("low");
  });

  it("sendCompact calls message endpoint with /compact", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    await act(async () => {
      await result.current.sendCompact();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/message",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "/compact" }),
      }
    );
  });

  // P1-1: Regression test — effort endpoint must send { level: ... } not { effort: ... }
  it("setEffort sends { level: ... } matching server expectation", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    await act(async () => {
      await result.current.setEffort("low");
    });

    const body = JSON.parse(
      (fetchMock.mock.calls.find((c) =>
        (c[0] as string).includes("/effort")
      )?.[1] as RequestInit).body as string
    );
    // Server expects { level: "low" }, NOT { effort: "low" }
    expect(body).toEqual({ level: "low" });
    expect(body).not.toHaveProperty("effort");
  });

  // P1-2: Regression test — API_BASE must use relative path, not hardcoded localhost
  it("uses relative /api path, not hardcoded localhost", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl("session-1"));

    await act(async () => {
      await result.current.setModel("claude-sonnet-4-20250514");
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("/api/sessions/session-1/model");
    expect(url).not.toContain("localhost");
  });

  // P2: Regression test — postJson must not throw on network error
  it("handles network errors gracefully without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network failure")))
    );
    const { result } = renderHook(() => useSessionControl("session-1"));

    // Should not throw — returns gracefully
    await act(async () => {
      await result.current.setModel("claude-sonnet-4-20250514");
      await result.current.toggleFastMode();
      await result.current.setEffort("low");
      await result.current.sendCompact();
    });

    // State should remain at defaults since all calls failed
    expect(result.current.model).toBeNull();
    expect(result.current.fastMode).toBe(false);
    expect(result.current.effort).toBe("high");
  });

  it("does nothing when sessionId is null", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSessionControl(null));

    await act(async () => {
      await result.current.setModel("claude-sonnet-4-20250514");
      await result.current.toggleFastMode();
      await result.current.setEffort("low");
      await result.current.sendCompact();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    // State should remain at defaults
    expect(result.current.model).toBeNull();
    expect(result.current.fastMode).toBe(false);
    expect(result.current.effort).toBe("high");
  });
});

describe("useSessionControl — model seeding", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds model from server when session mounts", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ model: "claude-sonnet-4-6" }),
    });

    const { result } = renderHook(() => useSessionControl("session-123"));

    await waitFor(() => {
      expect(result.current.model).toBe("claude-sonnet-4-6");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/sessions/session-123/model");
  });

  it("leaves model as null when server returns null", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ model: null }),
    });

    const { result } = renderHook(() => useSessionControl("session-123"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/session-123/model");
    });

    expect(result.current.model).toBeNull();
  });

  it("resets and re-fetches model when sessionId changes", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: "claude-opus-4-7" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: "claude-sonnet-4-6" }) });

    const { result, rerender } = renderHook(
      ({ sid }: { sid: string | null }) => useSessionControl(sid),
      { initialProps: { sid: "session-abc" } }
    );

    await waitFor(() => expect(result.current.model).toBe("claude-opus-4-7"));

    rerender({ sid: "session-xyz" });

    await waitFor(() => expect(result.current.model).toBe("claude-sonnet-4-6"));
  });

  it("does not fetch when sessionId is null", () => {
    const { result } = renderHook(() => useSessionControl(null));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.model).toBeNull();
  });

  it("does not apply stale model from session A after switching to session B", async () => {
    // session-A fetch resolves AFTER session-B fetch
    let resolveA!: (value: unknown) => void;
    const slowFetchA = new Promise((resolve) => { resolveA = resolve; });

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => slowFetchA) // session-A: delayed
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: "claude-sonnet-4-6" }) }); // session-B: fast

    const { result, rerender } = renderHook(
      ({ sid }: { sid: string | null }) => useSessionControl(sid),
      { initialProps: { sid: "session-a" } }
    );

    // Switch to session-B before session-A's fetch resolves
    rerender({ sid: "session-b" });

    // session-B resolves quickly
    await waitFor(() => expect(result.current.model).toBe("claude-sonnet-4-6"));

    // Now resolve session-A's stale fetch — should be ignored
    act(() => {
      resolveA({ ok: true, json: async () => ({ model: "claude-opus-4-7" }) });
    });

    // Wait a tick to let any pending microtasks run
    await new Promise((r) => setTimeout(r, 10));

    // Model must remain from session-B, not overwritten by stale session-A response
    expect(result.current.model).toBe("claude-sonnet-4-6");
  });
});
