import { describe, it, expect } from "vitest";
import { detectCacheMisses } from "../cache-misses.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeAssistant(uuid: string, inputTokens: number, cacheRead: number, cacheCreation = 0): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: "response",
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: inputTokens,
        output_tokens: 100,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
      },
    },
  };
}

function makeSession(id: string, events: AssistantEvent[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectCacheMisses", () => {
  it("flags sessions with low cache hit rate", () => {
    // 10k input, 0 cache read = 0% hit rate
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, 2000, 0)
    );
    const result = detectCacheMisses([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag sessions with good cache hit rate", () => {
    // 10k input, 8k cache read = 80% hit rate
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, 2000, 1600)
    );
    const result = detectCacheMisses([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("does not flag sessions with low total input", () => {
    // Only 500 total input tokens
    const events = [makeAssistant("1", 500, 0)];
    const result = detectCacheMisses([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectCacheMisses([]);
    expect(result.detected).toBe(false);
  });

  it("uses full denominator: input + cache_creation + cache_read", () => {
    // input_tokens=1000, cache_creation=3000, cache_read=6000
    // Total = 10000, hit rate = 6000/10000 = 60% => not flagged per-session (>=20%)
    // Overall: 60% hit rate => not flagged (>=30%)
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, 200, 1200, 600)
    );
    const result = detectCacheMisses([makeSession("s1", events)]);
    // With correct denominator: 6000 / (1000 + 3000 + 6000) = 60% => not detected
    // With buggy denominator: 6000 / 1000 = 600% => not detected (capped)
    // Both pass, but we verify stats show the correct rate
    expect(result.detected).toBe(false);
    expect(result.evidence.stats.overallHitRate).toBe(60);
  });

  it("detects low cache rate when cache_creation inflates denominator", () => {
    // input_tokens=2000, cache_creation=8000, cache_read=500
    // Total = 10500, hit rate = 500/10500 = ~4.8% => flagged
    // Old buggy denominator: 500/2000 = 25% => barely flagged at session level, borderline at overall
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, 400, 100, 1600)
    );
    const result = detectCacheMisses([makeSession("s1", events)]);
    // Total: input=2000, cacheCreation=8000, cacheRead=500, total=10500
    // hitRate = 500/10500 = ~4.8% => detected (< 30% overall, > 5000 total)
    expect(result.detected).toBe(true);
  });
});
