import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./insights-aggregator.js", () => ({
  computeInsightsSessionData: vi.fn(() => ({
    fileSize: 100, offset: 100, tokensIn: 1000, tokensOut: 500, cacheReadTokens: 0, cost: 0.01, turns: 3,
  })),
  getTimeRangeCutoff: vi.fn(() => 0),
}));

import { computeInsightsActivity } from "./activity-aggregator.js";
import { computeInsightsSessionData } from "./insights-aggregator.js";
import type { SessionInfo } from "../types.js";

const mockedSessionData = vi.mocked(computeInsightsSessionData);

function makeSession(id: string, startTime: string, cwd = "/home/user/project"): SessionInfo {
  return {
    id,
    projectHash: "abc",
    path: `/tmp/${id}.jsonl`,
    startTime,
    lastModified: startTime,
    eventCount: 10,
    subagentCount: 0,
    cwd,
    model: "claude-sonnet-4-6",
  };
}

describe("computeInsightsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSessionData.mockReturnValue({
      fileSize: 100, offset: 100, tokensIn: 1000, tokensOut: 500, cacheReadTokens: 0, cost: 0.01, turns: 3,
    });
  });

  it("returns 7*24=168 heatmap cells", () => {
    const sessions = [makeSession("s1", "2026-04-14T09:00:00Z")];
    const result = computeInsightsActivity(sessions, "all", "all");
    expect(result.heatmap).toHaveLength(168);
  });

  it("returns 24 hourly buckets", () => {
    const sessions = [makeSession("s1", "2026-04-14T09:00:00Z")];
    const result = computeInsightsActivity(sessions, "all", "all");
    expect(result.hourly).toHaveLength(24);
  });

  it("maps Monday (UTC day=1) to day index 0", () => {
    // 2026-04-13 is a Monday
    const sessions = [makeSession("s1", "2026-04-13T10:00:00Z")];
    const result = computeInsightsActivity(sessions, "all", "all");
    const cell = result.heatmap.find((c) => c.day === 0 && c.hour === 10);
    expect(cell).toBeDefined();
    expect(cell!.intensity).toBeGreaterThan(0);
  });

  it("maps Sunday (UTC day=0) to day index 6", () => {
    // 2026-04-19 is a Sunday
    const sessions = [makeSession("s1", "2026-04-19T08:00:00Z")];
    const result = computeInsightsActivity(sessions, "all", "all");
    const cell = result.heatmap.find((c) => c.day === 6 && c.hour === 8);
    expect(cell).toBeDefined();
    expect(cell!.intensity).toBeGreaterThan(0);
  });

  it("intensity is 4 for peak cell when single session", () => {
    const sessions = [makeSession("s1", "2026-04-13T14:00:00Z")];
    const result = computeInsightsActivity(sessions, "all", "all");
    const peakCell = result.heatmap.find((c) => c.day === 0 && c.hour === 14);
    expect(peakCell!.intensity).toBe(4);
    const emptyCell = result.heatmap.find((c) => c.day === 1 && c.hour === 3);
    expect(emptyCell!.intensity).toBe(0);
  });

  it("filters sessions by repo when not 'all'", () => {
    const sessions = [
      makeSession("s1", "2026-04-13T10:00:00Z"),
      makeSession("s2", "2026-04-13T11:00:00Z", "/other/project"),
    ];
    computeInsightsActivity(sessions, "all", "/home/user/project");
    expect(mockedSessionData).toHaveBeenCalledTimes(1);
  });

  it("hourly bucket tokensAvg averages across sessions in same hour", () => {
    mockedSessionData
      .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 2000, tokensOut: 0, cacheReadTokens: 0, cost: 0, turns: 1 })
      .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 4000, tokensOut: 0, cacheReadTokens: 0, cost: 0, turns: 1 });
    const sessions = [
      makeSession("s1", "2026-04-13T09:00:00Z"),
      makeSession("s2", "2026-04-14T09:00:00Z"),
    ];
    const result = computeInsightsActivity(sessions, "all", "all");
    const bucket = result.hourly.find((h) => h.hour === 9);
    expect(bucket!.tokensAvg).toBe(3000);
  });

  it("returns intensity 0 for all cells when no sessions", () => {
    const result = computeInsightsActivity([], "all", "all");
    expect(result.heatmap.every((c) => c.intensity === 0)).toBe(true);
    expect(result.hourly.every((h) => h.tokensAvg === 0)).toBe(true);
  });

  describe("daily aggregation", () => {
    it("returns empty daily array when no sessions", () => {
      const result = computeInsightsActivity([], "all", "all");
      expect(result.daily).toEqual([]);
    });

    it("returns one bucket per unique UTC date", () => {
      mockedSessionData
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 1000, tokensOut: 500, cacheReadTokens: 0, cost: 0.01, turns: 2 })
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 2000, tokensOut: 300, cacheReadTokens: 0, cost: 0.02, turns: 1 });
      const sessions = [
        makeSession("s1", "2026-04-13T09:00:00Z"),
        makeSession("s2", "2026-04-14T10:00:00Z"),
      ];
      const result = computeInsightsActivity(sessions, "all", "all");
      expect(result.daily).toHaveLength(2);
      expect(result.daily[0].date).toBe("2026-04-13");
      expect(result.daily[1].date).toBe("2026-04-14");
    });

    it("sums tokensIn, tokensOut, cost for sessions on the same date", () => {
      mockedSessionData
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 1000, tokensOut: 400, cacheReadTokens: 0, cost: 0.01, turns: 1 })
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 500, tokensOut: 100, cacheReadTokens: 0, cost: 0.005, turns: 1 });
      const sessions = [
        makeSession("s1", "2026-04-13T09:00:00Z"),
        makeSession("s2", "2026-04-13T14:00:00Z"),
      ];
      const result = computeInsightsActivity(sessions, "all", "all");
      expect(result.daily).toHaveLength(1);
      expect(result.daily[0]).toEqual({
        date: "2026-04-13",
        tokensIn: 1500,
        tokensOut: 500,
        cost: 0.015,
      });
    });

    it("sorts daily buckets ascending by date", () => {
      mockedSessionData
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 100, tokensOut: 50, cacheReadTokens: 0, cost: 0.001, turns: 1 })
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 200, tokensOut: 80, cacheReadTokens: 0, cost: 0.002, turns: 1 })
        .mockReturnValueOnce({ fileSize: 100, offset: 100, tokensIn: 300, tokensOut: 90, cacheReadTokens: 0, cost: 0.003, turns: 1 });
      // Sessions added out of order
      const sessions = [
        makeSession("s3", "2026-04-15T00:00:00Z"),
        makeSession("s1", "2026-04-13T23:59:59Z"),
        makeSession("s2", "2026-04-14T12:00:00Z"),
      ];
      const result = computeInsightsActivity(sessions, "all", "all");
      expect(result.daily.map((b) => b.date)).toEqual(["2026-04-13", "2026-04-14", "2026-04-15"]);
    });
  });
});
