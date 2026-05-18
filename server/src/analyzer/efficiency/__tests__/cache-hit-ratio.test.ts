import { describe, expect, it } from "vitest";
import { detectCacheHitRatio } from "../cache-hit-ratio.js";
import type { AssistantEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function assistant(input: number, cacheWrite: number, cacheRead: number): AssistantEvent {
  return {
    type: "assistant",
    uuid: `${input}-${cacheRead}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:00.000Z",
    message: {
      role: "assistant",
      content: "ok",
      model: "claude-sonnet-4-6",
      id: "msg",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: input, output_tokens: 100, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead },
    },
  };
}

function session(events: AssistantEvent[]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectCacheHitRatio", () => {
  it("warns on low cache hit ratio for high-token input", () => {
    const result = detectCacheHitRatio(session([assistant(60_000, 10_000, 5_000)]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("warn");
    expect(result.evidence.stats.cacheHitRatio).toBe("6.7%");
  });

  it("praises high cache hit ratio for high-token input", () => {
    const result = detectCacheHitRatio(session([assistant(10_000, 5_000, 80_000)]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("praise");
  });

  it("stays quiet below the input token gate", () => {
    expect(detectCacheHitRatio(session([assistant(1_000, 0, 0)])).detected).toBe(false);
  });
});
