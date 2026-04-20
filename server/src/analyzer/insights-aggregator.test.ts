import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent } from "../types.js";

vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(() => ({ size: 1000 })) };
});

import { computeInsightsAggregate, getTimeRangeCutoff } from "./insights-aggregator.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { statSync } from "node:fs";

const mockedParse = vi.mocked(parseJsonlIncremental);
const mockedStat = vi.mocked(statSync);

let counter = 0;
beforeEach(() => {
  vi.clearAllMocks();
  counter = 0;
  mockedStat.mockImplementation(() => ({ size: ++counter * 1000 }) as ReturnType<typeof statSync>);
});

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "s-" + Math.random().toString(36).slice(2),
    projectHash: "abc",
    path: "/tmp/test.jsonl",
    startTime: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    eventCount: 5,
    subagentCount: 0,
    cwd: "/home/user/project",
    ...overrides,
  };
}

function makeAssistantEvent(inputTokens: number, outputTokens: number, cacheReadTokens = 0): SessionEvent {
  return {
    type: "assistant",
    uuid: "a1",
    parentUuid: undefined,
    timestamp: new Date().toISOString(),
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cacheReadTokens,
      },
    },
  } as unknown as SessionEvent;
}

function makeUserEvent(userType: "external" | "internal"): SessionEvent {
  return {
    type: "user",
    uuid: "u1",
    parentUuid: undefined,
    timestamp: new Date().toISOString(),
    sessionId: "s1",
    userType,
    message: { role: "user", content: "hello" },
  } as unknown as SessionEvent;
}

describe("getTimeRangeCutoff", () => {
  it("returns 0 for all", () => {
    expect(getTimeRangeCutoff("all")).toBe(0);
  });
  it("returns cutoff within 24h range", () => {
    const cutoff = getTimeRangeCutoff("24h");
    const expected = Date.now() - 24 * 3600_000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(100);
  });
  it("returns cutoff within 7d range", () => {
    const cutoff = getTimeRangeCutoff("7d");
    const expected = Date.now() - 7 * 86400_000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(100);
  });
});

describe("computeInsightsAggregate", () => {
  it("returns zeros for empty sessions", () => {
    const result = computeInsightsAggregate([], "7d", "all");
    expect(result.sessions).toBe(0);
    expect(result.tokensIn).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.daily).toEqual([]);
  });

  it("aggregates token counts across sessions", () => {
    const session = makeSession();
    mockedParse.mockReturnValue({
      events: [makeAssistantEvent(1000, 500)],
      newOffset: 500,
    });
    const result = computeInsightsAggregate([session], "7d", "all");
    expect(result.sessions).toBe(1);
    expect(result.tokensIn).toBe(1000);
    expect(result.tokensOut).toBe(500);
    expect(result.cost).toBeGreaterThan(0);
  });

  it("counts only external user events as turns", () => {
    const session = makeSession();
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("external"),
        makeUserEvent("external"),
        makeUserEvent("internal"),
      ],
      newOffset: 300,
    });
    const result = computeInsightsAggregate([session], "7d", "all");
    expect(result.turns).toBe(2);
  });

  it("excludes sessions older than time range", () => {
    const old = makeSession({
      lastModified: new Date(Date.now() - 10 * 86400_000).toISOString(),
    });
    const result = computeInsightsAggregate([old], "7d", "all");
    expect(result.sessions).toBe(0);
  });

  it("includes all sessions when timeRange=all", () => {
    const old = makeSession({
      lastModified: new Date(Date.now() - 365 * 86400_000).toISOString(),
    });
    mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
    const result = computeInsightsAggregate([old], "all", "all");
    expect(result.sessions).toBe(1);
  });

  it("filters by repo cwd when repo !== all", () => {
    const matchingSession = makeSession({ cwd: "/home/user/project-a" });
    const otherSession = makeSession({ cwd: "/home/user/project-b" });
    mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
    const result = computeInsightsAggregate(
      [matchingSession, otherSession],
      "7d",
      "/home/user/project-a"
    );
    expect(result.sessions).toBe(1);
  });

  it("builds daily buckets keyed by UTC date", () => {
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0);
    const session = makeSession({ startTime: today.toISOString() });
    mockedParse.mockReturnValue({ events: [makeAssistantEvent(500, 200)], newOffset: 200 });
    const result = computeInsightsAggregate([session], "7d", "all");
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].date).toBe(today.toISOString().slice(0, 10));
    expect(result.daily[0].tokensIn).toBe(500);
  });

  it("daily array is sorted ascending by date", () => {
    const day1 = new Date();
    day1.setUTCDate(day1.getUTCDate() - 3);
    const day2 = new Date();
    const s1 = makeSession({ startTime: day1.toISOString(), path: "/tmp/s1.jsonl" });
    const s2 = makeSession({ startTime: day2.toISOString(), path: "/tmp/s2.jsonl" });
    mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
    const result = computeInsightsAggregate([s1, s2], "7d", "all");
    expect(result.daily[0].date <= result.daily[1].date).toBe(true);
  });

  it("computes avgCostPerTurn as zero when turns=0", () => {
    const session = makeSession();
    mockedParse.mockReturnValue({ events: [], newOffset: 0 });
    const result = computeInsightsAggregate([session], "7d", "all");
    expect(result.avgCostPerTurn).toBe(0);
  });

  it("activeDays counts distinct calendar days", () => {
    const day1 = new Date();
    day1.setUTCDate(day1.getUTCDate() - 1);
    const s1 = makeSession({ startTime: day1.toISOString(), path: "/tmp/s1.jsonl" });
    const s2 = makeSession({ startTime: day1.toISOString(), path: "/tmp/s2.jsonl" });
    mockedParse.mockReturnValue({ events: [], newOffset: 0 });
    const result = computeInsightsAggregate([s1, s2], "7d", "all");
    // Both sessions on same day → 1 active day
    expect(result.activeDays).toBe(1);
  });

  it("peakHour is 0 when no session data", () => {
    const result = computeInsightsAggregate([], "7d", "all");
    expect(result.peakHour).toBe(0);
  });

  it("aggregates cacheReadTokens across sessions", () => {
    const s1 = makeSession({ path: "/tmp/s1.jsonl" });
    const s2 = makeSession({ path: "/tmp/s2.jsonl" });
    let call = 0;
    mockedParse.mockImplementation(() => {
      call++;
      return {
        events: [makeAssistantEvent(100, 50, call === 1 ? 300 : 200)],
        newOffset: 100,
      };
    });
    const result = computeInsightsAggregate([s1, s2], "7d", "all");
    expect(result.cacheReadTokens).toBe(500);
  });

  it("returns cacheReadTokens=0 when no cache reads occurred", () => {
    const session = makeSession();
    mockedParse.mockReturnValue({
      events: [makeAssistantEvent(1000, 500, 0)],
      newOffset: 500,
    });
    const result = computeInsightsAggregate([session], "7d", "all");
    expect(result.cacheReadTokens).toBe(0);
  });

  describe("timezone offset (tzOffset)", () => {
    it("tzOffset=0 produces identical results to no-arg call", () => {
      const today = new Date();
      today.setUTCHours(10, 0, 0, 0);
      const session = makeSession({ startTime: today.toISOString() });
      mockedParse.mockReturnValue({ events: [makeAssistantEvent(500, 200)], newOffset: 200 });
      const resultDefault = computeInsightsAggregate([session], "7d", "all");
      const resultZero = computeInsightsAggregate([session], "7d", "all", 0);
      expect(resultZero.daily[0].date).toBe(resultDefault.daily[0].date);
      expect(resultZero.peakHour).toBe(resultDefault.peakHour);
    });

    it("shifts date bucket when tzOffset crosses midnight (UTC→local date change)", () => {
      // Session at 2026-04-13T23:30:00Z. In UTC+7 (tzOffset=-420), local time is 2026-04-14T06:30
      // So the local date bucket should be "2026-04-14", not "2026-04-13"
      const session = makeSession({ startTime: "2026-04-13T23:30:00.000Z" });
      mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
      const result = computeInsightsAggregate([session], "all", "all", -420);
      expect(result.daily).toHaveLength(1);
      expect(result.daily[0].date).toBe("2026-04-14");
    });

    it("shifts peakHour to local hour when tzOffset is applied", () => {
      // Session at 2026-04-13T23:00:00Z. In UTC+7 (tzOffset=-420), local hour is 6
      const session = makeSession({ startTime: "2026-04-13T23:00:00.000Z" });
      mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
      const result = computeInsightsAggregate([session], "all", "all", -420);
      expect(result.peakHour).toBe(6);
    });

    it("shifts peakHour backwards for negative UTC offset (UTC-5 / EST)", () => {
      // Session at 2026-04-14T10:00:00Z. In UTC-5 (tzOffset=300), local hour is 5
      const session = makeSession({ startTime: "2026-04-14T10:00:00.000Z" });
      mockedParse.mockReturnValue({ events: [makeAssistantEvent(100, 50)], newOffset: 100 });
      const result = computeInsightsAggregate([session], "all", "all", 300);
      expect(result.peakHour).toBe(5);
    });
  });
});
