import { describe, it, expect } from "vitest";
import { detectModelOveruse } from "../model-overuse.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeAssistant(uuid: string, model: string, inputTokens: number, outputTokens: number): AssistantEvent {
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
      stop_reason: "end_turn",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
}

function makeSession(id: string, events: AssistantEvent[], opts?: { eventCount?: number; subagentCount?: number }): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: opts?.eventCount ?? events.length, subagentCount: opts?.subagentCount ?? 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectModelOveruse", () => {
  it("flags simple sessions using Opus where Sonnet suffices", () => {
    // 5 Opus events with 50k input, 10k output each in a session with eventCount < 40
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, "claude-opus-4-6", 50_000, 10_000)
    );
    const result = detectModelOveruse([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag sessions with subagents (complex tasks)", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, "claude-opus-4-6", 50_000, 10_000)
    );
    const result = detectModelOveruse([makeSession("s1", events, { subagentCount: 2 })]);
    expect(result.detected).toBe(false);
  });

  it("does not flag sessions using Sonnet", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 50_000, 10_000)
    );
    const result = detectModelOveruse([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectModelOveruse([]);
    expect(result.detected).toBe(false);
  });
});
