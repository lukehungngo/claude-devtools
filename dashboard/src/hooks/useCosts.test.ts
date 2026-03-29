import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCosts } from "./useCosts";

const mockCostsResponse = {
  costs: {
    cost24h: 1.5,
    cost7d: 10.0,
    sessionCount24h: 5,
    sessionCount7d: 20,
    tokenIn24h: 100000,
    tokenOut24h: 50000,
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCostsResponse),
      } as Response)
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCosts", () => {
  it("fetches costs on mount", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    renderHook(() => useCosts());

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/costs");
  });

  it("refetches costs on interval", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    renderHook(() => useCosts());

    // initial fetch
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // advance 5 minutes — should trigger second fetch
    await act(async () => {
      vi.advanceTimersByTime(300_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // advance another 5 minutes — should trigger third fetch
    await act(async () => {
      vi.advanceTimersByTime(300_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cleans up interval on unmount", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    const { unmount } = renderHook(() => useCosts());

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    // advance time after unmount — should NOT trigger additional fetch
    await act(async () => {
      vi.advanceTimersByTime(300_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
