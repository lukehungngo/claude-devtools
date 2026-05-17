import { describe, it, expect } from "vitest";
import { detectImprovingTrend } from "../improving-trend.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent, UserEvent } from "../../../types.js";

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

function makeToolResult(uuid: string, isError: boolean): UserEvent {
  return {
    type: "user",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: `tu_${uuid}`, content: "result", is_error: isError }],
    },
    userType: "internal",
  };
}

function makeSession(id: string, events: (AssistantEvent | UserEvent)[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectImprovingTrend", () => {
  it("detects improvement in error rate", () => {
    // Prior: 50% error rate
    const prior = Array.from({ length: 4 }, (_, i) => makeSession(`p${i}`, [
      makeAssistant(`p${i}-a`, 1000, 0),
      makeToolResult(`p${i}-err`, true),
      makeToolResult(`p${i}-ok`, false),
    ]));
    // Current: 10% error rate
    const current = Array.from({ length: 4 }, (_, i) => makeSession(`c${i}`, [
      makeAssistant(`c${i}-a`, 1000, 0),
      makeToolResult(`c${i}-ok1`, false),
      makeToolResult(`c${i}-ok2`, false),
      makeToolResult(`c${i}-ok3`, false),
      makeToolResult(`c${i}-ok4`, false),
      makeToolResult(`c${i}-ok5`, false),
      makeToolResult(`c${i}-ok6`, false),
      makeToolResult(`c${i}-ok7`, false),
      makeToolResult(`c${i}-ok8`, false),
      makeToolResult(`c${i}-ok9`, false),
      makeToolResult(`c${i}-err`, true),
    ]));
    const result = detectImprovingTrend(current, prior);
    expect(result.detected).toBe(true);
    expect(result.punchline).toContain("error rate dropped");
  });

  it("returns not detected when prior period is too small", () => {
    const current = [makeSession("c1", [makeAssistant("c1-a", 1000, 500)])];
    const prior = [makeSession("p1", [makeAssistant("p1-a", 1000, 100)])];
    const result = detectImprovingTrend(current, prior);
    expect(result.detected).toBe(false);
  });

  it("returns not detected when no improvement", () => {
    // Both periods same error rate
    const makeP = (prefix: string) => Array.from({ length: 4 }, (_, i) => makeSession(`${prefix}${i}`, [
      makeAssistant(`${prefix}${i}-a`, 1000, 0),
      makeToolResult(`${prefix}${i}-err`, true),
      makeToolResult(`${prefix}${i}-ok`, false),
    ]));
    const result = detectImprovingTrend(makeP("c"), makeP("p"));
    expect(result.detected).toBe(false);
  });
});
