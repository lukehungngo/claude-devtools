import { describe, it, expect } from "vitest";
import { detectCacheMisses } from "../cache-misses.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeAssistant(uuid: string, inputTokens: number, cacheRead: number): AssistantEvent {
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
      usage: { input_tokens: inputTokens, output_tokens: 100, cache_read_input_tokens: cacheRead },
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
});
