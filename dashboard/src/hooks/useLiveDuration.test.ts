import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveDuration } from "./useLiveDuration";

describe("useLiveDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '—' for null spawnedAt", () => {
    const { result } = renderHook(() => useLiveDuration(null, null, true));
    expect(result.current).toBe("—");
  });

  it("returns '—' for unparseable spawnedAt", () => {
    const { result } = renderHook(() => useLiveDuration("not-a-date", null, true));
    expect(result.current).toBe("—");
  });

  it("freezes at endedAt - spawnedAt when endedAt is provided", () => {
    const { result } = renderHook(() =>
      useLiveDuration("2026-05-16T09:55:00Z", "2026-05-16T09:58:34Z", false),
    );
    expect(result.current).toBe("3m 34s");
  });

  it("ticks every second while live and not ended", () => {
    const { result, rerender } = renderHook(({ live }) =>
      useLiveDuration("2026-05-16T09:59:50Z", null, live),
      { initialProps: { live: true } },
    );
    expect(result.current).toBe("10s");
    act(() => { vi.advanceTimersByTime(2000); });
    rerender({ live: true });
    expect(result.current).toBe("12s");
  });

  it("does not tick when isLive is false", () => {
    const { result } = renderHook(() =>
      useLiveDuration("2026-05-16T09:59:50Z", null, false),
    );
    expect(result.current).toBe("10s");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe("10s");
  });

  it("formats seconds-only when under one minute", () => {
    const { result } = renderHook(() =>
      useLiveDuration("2026-05-16T09:59:55Z", "2026-05-16T10:00:00Z", false),
    );
    expect(result.current).toBe("5s");
  });
});
