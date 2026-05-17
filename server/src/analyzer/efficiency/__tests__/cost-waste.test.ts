import { describe, it, expect } from "vitest";
import { detectCostWaste } from "../cost-waste.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeAssistant(uuid: string, model: string, inputTokens: number, outputTokens: number, stopReason: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: "response",
      model,
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: stopReason as "end_turn",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
}

describe("detectCostWaste", () => {
  it("flags expensive sessions without end_turn", () => {
    // 10 events * (100k input * $3/1M + 20k output * $15/1M) = 10 * (0.30 + 0.30) = $6.00
    const events = Array.from({ length: 10 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 100_000, 20_000, "tool_use")
    );
    const session: SessionWithEvents = {
      info: { id: "s1", projectHash: "proj", path: "/tmp/s1.jsonl", startTime: new Date(Date.now() - 86_400_000).toISOString(), lastModified: new Date(Date.now() - 86_400_000).toISOString(), eventCount: 10, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(true);
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag cheap sessions", () => {
    const events = [makeAssistant("1", "claude-sonnet-4-6", 100, 50, "tool_use")];
    const session: SessionWithEvents = {
      info: { id: "s1", projectHash: "proj", path: "/tmp/s1.jsonl", startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: 1, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(false);
  });

  it("does not flag sessions that completed with end_turn", () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 100_000, 20_000, "tool_use")
    );
    events.push(makeAssistant("9", "claude-sonnet-4-6", 100_000, 20_000, "end_turn"));
    const session: SessionWithEvents = {
      info: { id: "s1", projectHash: "proj", path: "/tmp/s1.jsonl", startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: 10, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(false);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectCostWaste([]);
    expect(result.detected).toBe(false);
  });
});
