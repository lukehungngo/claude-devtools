import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useInsightsAggregate } from "./useInsightsAggregate";

// ---------------------------------------------------------------------------
// Isolated unit test for daysAgoLocalString boundary correctness.
// We import the module internals by re-exporting them from a test-only helper.
// Since daysAgoLocalString is not exported, we test it indirectly via
// sumDailySlice / the hook's delta computation while controlling Date.now().
// ---------------------------------------------------------------------------

function makeAggregate(override: Record<string, unknown> = {}) {
  return {
    tokensIn: 1000,
    tokensOut: 500,
    cacheReadTokens: 0,
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
      expect.stringMatching(/\/api\/insights\/aggregate\?timeRange=7d&repo=all&tz=-?\d+/)
    );
  });

  it("makes two fetches for 7d — primary + delta (30d)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeAggregate()) });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/insights\/aggregate\?timeRange=30d&repo=all&tz=-?\d+/)
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

  it("exposes cacheReadTokens from the API response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeAggregate({ cacheReadTokens: 12_500 })),
    });
    const { result } = renderHook(() => useInsightsAggregate("7d", "all"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.cacheReadTokens).toBe(12_500);
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
      expect.stringMatching(/\/api\/insights\/aggregate\?timeRange=30d&repo=all&tz=-?\d+/)
    );
  });

  // Regression: daysAgoUtcString used UTC date boundaries but daily buckets are
  // keyed to local dates. For users in UTC+7 (tzOffset=-420) at 22:30 UTC,
  // local date is one day ahead of UTC. The 7d boundary computed in UTC is
  // "2026-04-13", but the correct local boundary is "2026-04-14". Similarly the
  // 14d (prior slice lower) boundary in UTC is "2026-04-06" vs correct "2026-04-07".
  // A data point on "2026-04-06" is 15 local days ago and must NOT appear in the
  // prior 7d slice — but the UTC-based boundary includes it.
  it("sumDailySlice uses local date boundary (not UTC) for non-UTC timezone", async () => {
    // Pin time so that UTC date != local date:
    // 2026-04-20T22:30:00Z → UTC date "2026-04-20"
    // UTC+7 local time 2026-04-21T05:30:00 → local date "2026-04-21"
    // Only fake Date, not timers, so waitFor still works.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-20T22:30:00Z").getTime());

    // Stub getTimezoneOffset to simulate UTC+7 user (JS: minutes WEST = -420)
    const origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = (): number => -420;

    // Layout:
    //   Local current 7d: ["2026-04-14", ∞) → 8 items × 100 = 800 tokensIn
    //   Local prior 7d:   ["2026-04-07", "2026-04-14") → 7 items × 100 = 700 tokensIn
    //   "2026-04-06" is 15 local days ago — must NOT appear in prior slice.
    //   With UTC bug: prior lower = "2026-04-06" (UTC 14 days ago from "2026-04-20")
    //     → includes "2026-04-06" (9900) → prior = 10500, current = 900
    //     → delta = (900-10500)/10500 ≈ -1.0
    //   With local fix: prior lower = "2026-04-07" → prior = 700, current = 800
    //     → delta = (800-700)/700 ≈ 0.143
    const widerAggregate = makeAggregate({
      daily: [
        { date: "2026-04-21", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-20", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-19", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-18", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-17", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-16", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-15", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-14", tokensIn: 100, tokensOut: 40, cost: 0.001 }, // local boundary: in current
        { date: "2026-04-13", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-12", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-11", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-10", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-09", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-08", tokensIn: 100, tokensOut: 40, cost: 0.001 },
        { date: "2026-04-07", tokensIn: 100, tokensOut: 40, cost: 0.001 }, // prior slice lower bound (local)
        // 15 local days ago — must be excluded from prior slice
        { date: "2026-04-06", tokensIn: 9900, tokensOut: 3960, cost: 0.099 },
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

    Date.prototype.getTimezoneOffset = origGetTimezoneOffset;
    vi.useRealTimers();

    // With local fix: current=800, prior=700 → delta ≈ 0.143
    // With UTC bug: current=900, prior=10500 → delta ≈ -1.0
    // We assert the correct value; the bug value is wildly different.
    expect(result.current.delta?.tokensIn).toBeCloseTo(800 / 700 - 1, 2);
  });
});
