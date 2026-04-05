import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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
