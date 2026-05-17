import { describe, it, expect } from "vitest";
import { detectCostWaste } from "../cost-waste.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, SessionEvent, AssistantEvent, UserEvent } from "../../../types.js";

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

function makeUserWithToolResults(uuid: string, results: Array<{ is_error?: boolean }>): UserEvent {
  return {
    type: "user",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    userType: "internal",
    message: {
      role: "user",
      content: results.map((r, i) => ({
        type: "tool_result" as const,
        tool_use_id: `tu_${uuid}_${i}`,
        content: r.is_error ? "Error occurred" : "Success",
        is_error: r.is_error,
      })),
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

  it("does not flag sessions costing less than $3 (new threshold)", () => {
    // 5 events * (30k input * $3/1M + 10k output * $15/1M) = 5 * (0.09 + 0.15) = $1.20
    const events: SessionEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 30_000, 10_000, "tool_use")
    );
    const session: SessionWithEvents = {
      info: { id: "s-cheap", projectHash: "proj", path: "/tmp/s-cheap.jsonl", startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: 5, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.evidence.sessions).toHaveLength(0);
  });

  it("flags session with end_turn but error rate > 25%", () => {
    // 10 events with high cost AND end_turn, but 50% error rate in tool_results
    const assistantEvents: SessionEvent[] = Array.from({ length: 10 }, (_, i) =>
      makeAssistant(`a${i}`, "claude-sonnet-4-6", 100_000, 20_000, i === 9 ? "end_turn" : "tool_use")
    );
    // 4 tool_results: 2 errors out of 4 = 50% error rate
    const userEvents: SessionEvent[] = [
      makeUserWithToolResults("u1", [{ is_error: true }, { is_error: false }]),
      makeUserWithToolResults("u2", [{ is_error: true }, { is_error: false }]),
    ];
    const session: SessionWithEvents = {
      info: { id: "s-errors", projectHash: "proj", path: "/tmp/s-errors.jsonl", startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: 12, subagentCount: 0 } as SessionInfo,
      mainEvents: [...assistantEvents, ...userEvents],
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(true);
    expect(result.evidence.sessions.some((s) => s.id === "s-errors")).toBe(true);
  });

  it("does not flag session with end_turn and zero tool_results", () => {
    // Expensive session with end_turn, no tool_results at all
    const events: SessionEvent[] = Array.from({ length: 10 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 100_000, 20_000, i === 9 ? "end_turn" : "tool_use")
    );
    const session: SessionWithEvents = {
      info: { id: "s-notool", projectHash: "proj", path: "/tmp/s-notool.jsonl", startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: 10, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(false);
  });
});
