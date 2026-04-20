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

  describe("timezone offset (tzOffset)", () => {
    it("tzOffset=0 produces identical results to default call", () => {
      const sessions = [makeSession("s1", "2026-04-13T10:00:00Z")];
      const resultDefault = computeInsightsActivity(sessions, "all", "all");
      const resultZero = computeInsightsActivity(sessions, "all", "all", 0);
      expect(resultZero.heatmap).toEqual(resultDefault.heatmap);
      expect(resultZero.hourly).toEqual(resultDefault.hourly);
    });

    it("shifts day-of-week bucket when tzOffset crosses midnight (UTC Sun → local Mon)", () => {
      // 2026-04-19T23:30:00Z is Sunday. In UTC+7 (tzOffset=-420), local is 2026-04-20T06:30 = Monday
      // Monday maps to day index 0 (Mon=0), Sunday maps to day index 6 (Sun=6)
      const sessions = [makeSession("s1", "2026-04-19T23:30:00Z")];
      const result = computeInsightsActivity(sessions, "all", "all", -420);
      // Should be in day 0 (Monday), hour 6
      const cell = result.heatmap.find((c) => c.day === 0 && c.hour === 6);
      expect(cell?.intensity).toBeGreaterThan(0);
      // Should NOT be in day 6 (Sunday), hour 23
      const wrongCell = result.heatmap.find((c) => c.day === 6 && c.hour === 23);
      expect(wrongCell?.intensity).toBe(0);
    });

    it("shifts hour bucket when tzOffset is applied (UTC-5 / EST)", () => {
      // 2026-04-14T10:00:00Z. In UTC-5 (tzOffset=300), local hour is 5
      const sessions = [makeSession("s1", "2026-04-14T10:00:00Z")];
      const result = computeInsightsActivity(sessions, "all", "all", 300);
      const hourlyBucket = result.hourly.find((h) => h.hour === 5);
      expect(hourlyBucket?.tokensAvg).toBeGreaterThan(0);
      const wrongBucket = result.hourly.find((h) => h.hour === 10);
      expect(wrongBucket?.tokensAvg).toBe(0);
    });
  });
});
