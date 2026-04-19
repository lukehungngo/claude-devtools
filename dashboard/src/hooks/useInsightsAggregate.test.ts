import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useInsightsAggregate } from "./useInsightsAggregate";

function makeAggregate(override: Record<string, unknown> = {}) {
  return {
    tokensIn: 1000,
    tokensOut: 500,
    cost: 0.01,
    sessions: 5,
    turns: 20,
    avgCostPerTurn: 0.0005,
    avgTokensPerTurn: 75,
    activeDays: 3,
    peakHour: 14,
    daily: [] as Array<{ date: string; tokensIn: number; tokensOut: number; cost: number }>,
    ...override,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useInsightsAggregate", () => {
  it("returns loading=true initially", () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches primary URL and returns data", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.sessions).toBe(5);
    expect(result.current.data?.turns).toBe(20);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/insights/aggregate?timeRange=7d&repo=all"
    );
  });

  it("makes two fetches for 7d — primary + delta (30d)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/insights/aggregate?timeRange=30d&repo=all"
    );
  });

  it("makes only one fetch for 'all' — no delta possible", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("all", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.delta).toBeNull();
  });

  it("makes only one fetch for '24h' — no delta possible", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("24h", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.delta).toBeNull();
  });

  it("computes delta from daily[] slices", async () => {
    const now = new Date();
    const makeDate = (daysAgo: number): string => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const widerAggregate = makeAggregate({
      daily: [
        { date: makeDate(1), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(2), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(3), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(4), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(5), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(6), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(7), tokensIn: 200, tokensOut: 80, cost: 0.002 },
        { date: makeDate(8), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(9), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(10), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(11), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(12), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(13), tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: makeDate(14), tokensIn: 100, tokensOut: 40, cost: 0.001 },
      ],
    });
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      const payload = callCount === 1 ? makeAggregate() : widerAggregate;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // current tokensIn=1400, prev tokensIn=700 → delta = 1.0
    expect(result.current.delta?.tokensIn).toBeCloseTo(1.0, 1);
    expect(result.current.delta?.tokensOut).toBeCloseTo(1.0, 1);
  });

  it("sets error and loading=false on HTTP error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("HTTP 500");
    expect(result.current.data).toBeNull();
  });

  it("refetches when refreshCount changes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result, rerender } = renderHook(
      ({ rc }: { rc: number }) => useInsightsAggregate("7d", "all", rc),
      { initialProps: { rc: 0 } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockClear();
    rerender({ rc: 1 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("refetches when timeRange changes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result, rerender } = renderHook(
      ({ tr }: { tr: string }) => useInsightsAggregate(tr, "all"),
      { initialProps: { tr: "7d" } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockClear();
    rerender({ tr: "30d" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/insights/aggregate?timeRange=30d&repo=all"
    );
  });
});
