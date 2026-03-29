import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetricsCache } from "./metrics-cache.js";
import type { SessionMetrics, SessionEvent, SessionInfo, AggregatedTokens } from "../types.js";

function makeSessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "test-session",
    projectHash: "abc123",
    path: "/tmp/test.jsonl",
    startTime: "2026-03-23T10:00:00Z",
    lastModified: "2026-03-23T10:05:00Z",
    eventCount: 10,
    subagentCount: 0,
    isActive: false,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    session: makeSessionInfo(),
    dag: { nodes: [], edges: [] },
    tokens: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.01,
    },
    tokensByModel: {},
    tokensByTurn: [],
    tools: [],
    totalEvents: 10,
    totalToolCalls: 5,
    totalAgents: 1,
    models: ["claude-sonnet-4-6"],
    duration: 300000,
    contextPercent: 25,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
    ...overrides,
  };
}

describe("MetricsCache", () => {
  let cache: MetricsCache;

  beforeEach(() => {
    cache = new MetricsCache({ maxEntries: 5, ttlMs: 60_000 });
  });

  it("stores and retrieves cached entries by file path + size + mtime", () => {
    const key = { filePath: "/tmp/a.jsonl", size: 1000, mtimeMs: 12345 };
    const metrics = makeMetrics();
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    cache.set(key, { metrics, events, subagentMeta });

    const result = cache.get(key);
    expect(result).not.toBeNull();
    expect(result!.metrics).toEqual(metrics);
  });

  it("returns null for cache miss", () => {
    const key = { filePath: "/tmp/missing.jsonl", size: 1000, mtimeMs: 12345 };
    expect(cache.get(key)).toBeNull();
  });

  it("invalidates when size changes", () => {
    const metrics = makeMetrics();
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    cache.set(
      { filePath: "/tmp/a.jsonl", size: 1000, mtimeMs: 12345 },
      { metrics, events, subagentMeta }
    );

    const result = cache.get({
      filePath: "/tmp/a.jsonl",
      size: 2000,
      mtimeMs: 12345,
    });
    expect(result).toBeNull();
  });

  it("invalidates when mtime changes", () => {
    const metrics = makeMetrics();
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    cache.set(
      { filePath: "/tmp/a.jsonl", size: 1000, mtimeMs: 12345 },
      { metrics, events, subagentMeta }
    );

    const result = cache.get({
      filePath: "/tmp/a.jsonl",
      size: 1000,
      mtimeMs: 99999,
    });
    expect(result).toBeNull();
  });

  it("evicts oldest entry when max entries exceeded (LRU)", () => {
    vi.useFakeTimers();

    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    // Fill cache to max (5), with distinct timestamps
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100);
      cache.set(
        { filePath: `/tmp/${i}.jsonl`, size: 100, mtimeMs: 100 },
        { metrics: makeMetrics(), events, subagentMeta }
      );
    }

    // Access entry 0 to make it recently used
    vi.advanceTimersByTime(100);
    cache.get({ filePath: "/tmp/0.jsonl", size: 100, mtimeMs: 100 });

    // Add one more - should evict entry 1 (least recently used)
    vi.advanceTimersByTime(100);
    cache.set(
      { filePath: "/tmp/5.jsonl", size: 100, mtimeMs: 100 },
      { metrics: makeMetrics(), events, subagentMeta }
    );

    // Entry 1 should be evicted (it was the LRU since 0 was accessed)
    expect(
      cache.get({ filePath: "/tmp/1.jsonl", size: 100, mtimeMs: 100 })
    ).toBeNull();

    // Entry 0 should still be present
    expect(
      cache.get({ filePath: "/tmp/0.jsonl", size: 100, mtimeMs: 100 })
    ).not.toBeNull();

    // Entry 5 should be present
    expect(
      cache.get({ filePath: "/tmp/5.jsonl", size: 100, mtimeMs: 100 })
    ).not.toBeNull();

    vi.useRealTimers();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();

    const shortCache = new MetricsCache({ maxEntries: 10, ttlMs: 1000 });
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    shortCache.set(
      { filePath: "/tmp/a.jsonl", size: 100, mtimeMs: 100 },
      { metrics: makeMetrics(), events, subagentMeta }
    );

    // Before TTL
    expect(
      shortCache.get({ filePath: "/tmp/a.jsonl", size: 100, mtimeMs: 100 })
    ).not.toBeNull();

    // After TTL
    vi.advanceTimersByTime(1500);
    expect(
      shortCache.get({ filePath: "/tmp/a.jsonl", size: 100, mtimeMs: 100 })
    ).toBeNull();

    vi.useRealTimers();
  });

  it("reports cache size correctly", () => {
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    expect(cache.size).toBe(0);

    cache.set(
      { filePath: "/tmp/a.jsonl", size: 100, mtimeMs: 100 },
      { metrics: makeMetrics(), events, subagentMeta }
    );
    expect(cache.size).toBe(1);
  });

  it("clear() removes all entries", () => {
    const events: SessionEvent[] = [];
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    cache.set(
      { filePath: "/tmp/a.jsonl", size: 100, mtimeMs: 100 },
      { metrics: makeMetrics(), events, subagentMeta }
    );
    cache.set(
      { filePath: "/tmp/b.jsonl", size: 200, mtimeMs: 200 },
      { metrics: makeMetrics(), events, subagentMeta }
    );

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
