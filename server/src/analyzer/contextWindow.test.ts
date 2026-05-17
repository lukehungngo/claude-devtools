import { describe, it, expect } from "vitest";
import type { SessionEvent, AssistantEvent } from "../types.js";
import { deriveObservedContextWindow } from "./contextWindow.js";

function makeAssistant(
  usage: Partial<AssistantEvent["message"]["usage"]>,
  overrides: Partial<AssistantEvent> = {},
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid ?? "uuid-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp ?? "2026-05-17T10:00:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "x" }],
      model: overrides.message?.model ?? "claude-sonnet-4-6",
      id: "msg-x",
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    },
  };
}

describe("deriveObservedContextWindow", () => {
  it("Fixture A: all observations below 200K → 200K window", () => {
    const events: SessionEvent[] = [
      makeAssistant({ input_tokens: 50_000 }),
      makeAssistant({ input_tokens: 80_000 }),
      makeAssistant({
        input_tokens: 100_000,
        cache_read_input_tokens: 15_000,
        cache_creation_input_tokens: 5_000,
      }), // sum=120K
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("Fixture B: an observation above 200K → 1M window", () => {
    const events: SessionEvent[] = [
      makeAssistant({ input_tokens: 100_000 }),
      makeAssistant({
        input_tokens: 800_000,
        cache_read_input_tokens: 199_000,
      }), // sum=999K
    ];
    expect(deriveObservedContextWindow(events)).toBe(1_000_000);
  });

  it("Fixture C: exact boundary at 200_000 → still 200K", () => {
    const events: SessionEvent[] = [
      makeAssistant({ input_tokens: 200_000 }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("Fixture D: 200_001 (one over) → bumps to 1M tier", () => {
    const events: SessionEvent[] = [
      makeAssistant({ input_tokens: 200_001 }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(1_000_000);
  });

  it("Fixture E: empty events → 200K default", () => {
    expect(deriveObservedContextWindow([])).toBe(200_000);
  });

  it("Fixture F: assistant events without message.usage → 200K default", () => {
    const events = [
      {
        type: "assistant",
        uuid: "u1",
        timestamp: "2026-05-17T10:00:00Z",
        sessionId: "test-session",
        message: {
          role: "assistant",
          content: [],
          model: "claude-opus-4-7",
          id: "m1",
          type: "message",
          stop_reason: "end_turn",
          // usage omitted
        },
      } as unknown as SessionEvent,
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("Fixture G: only assistant events contribute (user / attachment ignored)", () => {
    const userEvent = {
      type: "user",
      uuid: "u-1",
      timestamp: "2026-05-17T10:00:00Z",
      sessionId: "test-session",
      message: {
        role: "user",
        content: [{ type: "text", text: "hi" }],
        // pretend a malformed user event with a huge "usage" — must be IGNORED
        usage: { input_tokens: 999_999 },
      },
      userType: "external",
    } as unknown as SessionEvent;

    const attachmentEvent = {
      type: "attachment",
      uuid: "a-1",
      timestamp: "2026-05-17T10:00:00Z",
      sessionId: "test-session",
      message: { usage: { input_tokens: 999_999 } },
    } as unknown as SessionEvent;

    const events: SessionEvent[] = [
      userEvent,
      attachmentEvent,
      makeAssistant({ input_tokens: 50_000 }),
    ];

    // Only the 50K assistant observation counts; user/attachment are ignored.
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("treats undefined sub-fields as zero (does not crash, does not bump tier)", () => {
    const events: SessionEvent[] = [
      makeAssistant({
        input_tokens: 150_000,
        // cache_read_input_tokens omitted
        // cache_creation_input_tokens omitted
      }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });
});
