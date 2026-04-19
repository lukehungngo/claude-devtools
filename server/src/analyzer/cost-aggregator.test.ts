import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent } from "../types.js";

// Mock parseJsonlIncremental since cost-aggregator reads files incrementally
vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));

// Mock fs.statSync for cost aggregator's file stat check
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync: vi.fn(() => ({ size: 1000 })),
  };
});

import { aggregateCosts, _resetCostCacheForTesting } from "./cost-aggregator.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { statSync } from "node:fs";

const mockedParseJsonlIncremental = vi.mocked(parseJsonlIncremental);
const mockedStatSync = vi.mocked(statSync);

function makeSessionInfo(
  lastModifiedDate: Date,
  overrides: Partial<SessionInfo> = {}
): SessionInfo {
  return {
    id: "session-" + Math.random().toString(36).slice(2),
    projectHash: "abc123",
    path: "/tmp/test.jsonl",
    startTime: "2026-03-23T10:00:00Z",
    lastModified: lastModifiedDate.toISOString(),
    eventCount: 5,
    subagentCount: 0,
    ...overrides,
  };
}

function makeAssistantEvents(inputTokens: number, outputTokens: number) {
  return [
    {
      type: "assistant" as const,
      uuid: "a1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "hello" }],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message" as const,
        stop_reason: "end_turn" as const,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    },
  ];
}

function makeAssistantEventsWithCache(
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number
) {
  return [
    {
      type: "assistant" as const,
      uuid: "a2",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s2",
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "cached" }],
        model: "claude-sonnet-4-6",
        id: "msg-2",
        type: "message" as const,
        stop_reason: "end_turn" as const,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreation,
          cache_read_input_tokens: cacheRead,
        },
      },
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: statSync returns a distinct size each call to avoid stale cache hits
  let fileCounter = 0;
  mockedStatSync.mockImplementation(() => ({ size: ++fileCounter * 1000 }) as ReturnType<typeof statSync>);
});

describe("aggregateCosts", () => {
  it("returns zero costs for empty sessions array", () => {
    const result = aggregateCosts([]);

    expect(result.cost24h).toBe(0);
    expect(result.cost7d).toBe(0);
    expect(result.sessionCount24h).toBe(0);
    expect(result.sessionCount7d).toBe(0);
  });

  it("includes sessions within 24h window", () => {
    const now = new Date();
    const recentSession = makeSessionInfo(now);
    mockedParseJsonlIncremental.mockReturnValue(
      { events: makeAssistantEvents(1000, 500) as unknown as SessionEvent[], newOffset: 500 }
    );

    const result = aggregateCosts([recentSession]);

    expect(result.sessionCount24h).toBe(1);
    expect(result.cost24h).toBeGreaterThan(0);
    expect(result.tokenIn24h).toBe(1000);
    expect(result.tokenOut24h).toBe(500);
  });

  it("includes sessions within 7d window but not 24h", () => {
    // Session from 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const olderSession = makeSessionInfo(threeDaysAgo);
    mockedParseJsonlIncremental.mockReturnValue(
      { events: makeAssistantEvents(2000, 1000) as unknown as SessionEvent[], newOffset: 500 }
    );

    const result = aggregateCosts([olderSession]);

    expect(result.sessionCount7d).toBe(1);
    expect(result.sessionCount24h).toBe(0);
    expect(result.cost7d).toBeGreaterThan(0);
    expect(result.cost24h).toBe(0);
    expect(result.tokenIn7d).toBe(2000);
    expect(result.tokenOut7d).toBe(1000);
  });

  it("excludes sessions older than 7 days", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const oldSession = makeSessionInfo(twoWeeksAgo);

    const result = aggregateCosts([oldSession]);

    expect(result.sessionCount7d).toBe(0);
    expect(result.sessionCount24h).toBe(0);
    expect(result.cost7d).toBe(0);
    expect(result.cost24h).toBe(0);
  });

  it("aggregates costs across multiple sessions", () => {
    const now = new Date();
    const session1 = makeSessionInfo(now, { path: "/tmp/s1.jsonl" });
    const session2 = makeSessionInfo(now, { path: "/tmp/s2.jsonl" });

    mockedParseJsonlIncremental
      .mockReturnValueOnce({ events: makeAssistantEvents(1000, 500) as unknown as SessionEvent[], newOffset: 500 })
      .mockReturnValueOnce({ events: makeAssistantEvents(2000, 1000) as unknown as SessionEvent[], newOffset: 500 });

    const result = aggregateCosts([session1, session2]);

    expect(result.sessionCount24h).toBe(2);
    expect(result.tokenIn24h).toBe(3000);
    expect(result.tokenOut24h).toBe(1500);
  });

  it("24h sessions are also counted in 7d window", () => {
    const now = new Date();
    const recentSession = makeSessionInfo(now);
    mockedParseJsonlIncremental.mockReturnValue(
      { events: makeAssistantEvents(1000, 500) as unknown as SessionEvent[], newOffset: 500 }
    );

    const result = aggregateCosts([recentSession]);

    expect(result.sessionCount24h).toBe(1);
    expect(result.sessionCount7d).toBe(1);
    expect(result.cost24h).toBe(result.cost7d);
  });

  it("handles sessions with no assistant events (zero cost)", () => {
    const now = new Date();
    const session = makeSessionInfo(now);
    mockedParseJsonlIncremental.mockReturnValue(
      { events: [], newOffset: 0 }
    );

    const result = aggregateCosts([session]);

    expect(result.sessionCount24h).toBe(1);
    expect(result.cost24h).toBe(0);
    expect(result.tokenIn24h).toBe(0);
  });

  it("uses session lastModified to determine time window", () => {
    // Session at exactly 24h boundary
    const justOver24h = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const session = makeSessionInfo(justOver24h);
    mockedParseJsonlIncremental.mockReturnValue(
      { events: makeAssistantEvents(1000, 500) as unknown as SessionEvent[], newOffset: 500 }
    );

    const result = aggregateCosts([session]);

    // Should be in 7d but not 24h
    expect(result.sessionCount24h).toBe(0);
    expect(result.sessionCount7d).toBe(1);
  });

  // REPRODUCTION TEST for bug: tokenIn24h excluded cache_read and cache_creation tokens
  it("tokenIn24h includes bare input + cache_read + cache_creation tokens", () => {
    _resetCostCacheForTesting();
    const now = new Date();
    const session = makeSessionInfo(now);
    // 5000 bare input + 200000 cache_read + 50000 cache_creation = 255000 total
    mockedParseJsonlIncremental.mockReturnValue({
      events: makeAssistantEventsWithCache(5000, 1000, 50000, 200000) as unknown as SessionEvent[],
      newOffset: 500,
    });

    const result = aggregateCosts([session]);

    // Before fix: result.tokenIn24h === 5000 (only bare input_tokens)
    // After fix:  result.tokenIn24h === 255000 (bare + cache_read + cache_creation)
    expect(result.tokenIn24h).toBe(255000);
    expect(result.tokenIn7d).toBe(255000);
  });

  it("cacheRead24h and cacheWrite24h are tracked separately", () => {
    _resetCostCacheForTesting();
    const now = new Date();
    const session = makeSessionInfo(now);
    mockedParseJsonlIncremental.mockReturnValue({
      events: makeAssistantEventsWithCache(5000, 1000, 50000, 200000) as unknown as SessionEvent[],
      newOffset: 500,
    });

    const result = aggregateCosts([session]);

    expect(result.cacheRead24h).toBe(200000);
    expect(result.cacheWrite24h).toBe(50000);
    expect(result.cacheRead7d).toBe(200000);
    expect(result.cacheWrite7d).toBe(50000);
  });

  it("cost is not double-counted: cache tokens are not re-billed at bare input rate", () => {
    _resetCostCacheForTesting();
    const now = new Date();
    const noCacheSession = makeSessionInfo(now, { path: "/tmp/no-cache.jsonl" });
    const withCacheSession = makeSessionInfo(now, { path: "/tmp/with-cache.jsonl" });

    // Session 1: 255000 bare tokens, no cache
    // Session 2: 5000 bare + 50000 cache_creation + 200000 cache_read
    // The cache session should cost LESS than an equivalent bare session because
    // cache reads are cheaper than bare input tokens.
    mockedParseJsonlIncremental
      .mockReturnValueOnce({
        events: makeAssistantEvents(255000, 1000) as unknown as SessionEvent[],
        newOffset: 500,
      })
      .mockReturnValueOnce({
        events: makeAssistantEventsWithCache(5000, 1000, 50000, 200000) as unknown as SessionEvent[],
        newOffset: 500,
      });

    const noCacheResult = aggregateCosts([noCacheSession]);
    _resetCostCacheForTesting();
    const withCacheResult = aggregateCosts([withCacheSession]);

    // With caching, cost must be strictly less (cache reads are discounted)
    expect(withCacheResult.cost24h).toBeLessThan(noCacheResult.cost24h);
  });
});
