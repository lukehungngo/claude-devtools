/**
 * Tests for null/undefined property access crashes in JSONL data processing.
 *
 * These tests reproduce bugs where .slice(), .trim(), .split() etc.
 * are called on potentially undefined/null string properties from JSONL data.
 */
import { describe, it, expect } from "vitest";
import { eventsToLogEntries } from "../components/AgentLogs";
import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  AgentNode,
} from "../lib/types";

// Helper to create a minimal assistant event with specific content items
function makeAssistantEvent(
  content: unknown[],
  uuid = "test-uuid"
): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: "2026-03-23T00:00:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: content as AssistantEvent["message"]["content"],
      model: "claude-opus-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    },
  };
}

function makeUserEvent(
  content: unknown[],
  uuid = "user-uuid"
): UserEvent {
  return {
    type: "user",
    uuid,
    timestamp: "2026-03-23T00:00:00Z",
    sessionId: "test-session",
    userType: "internal",
    message: {
      role: "user",
      content: content as UserEvent["message"]["content"],
    },
  };
}

const emptyAgents: AgentNode[] = [];

describe("Bug 3: AgentLogs content.thinking.slice crash", () => {
  it("should not crash when thinking content has undefined thinking field", () => {
    const event = makeAssistantEvent([
      { type: "thinking", thinking: undefined },
    ]);
    // This should not throw
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });

  it("should not crash when thinking content has null thinking field", () => {
    const event = makeAssistantEvent([
      { type: "thinking", thinking: null },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });
});

describe("Bug 4: AgentLogs content.text.slice crash (assistant)", () => {
  it("should not crash when text content has undefined text field", () => {
    const event = makeAssistantEvent([
      { type: "text", text: undefined },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });

  it("should not crash when text content has null text field", () => {
    const event = makeAssistantEvent([
      { type: "text", text: null },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });
});

describe("Bug 5: AgentLogs content.text.slice crash (user event)", () => {
  it("should not crash when user text content has undefined text field", () => {
    const event = makeUserEvent([
      { type: "text", text: undefined },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });

  it("should not crash when user text content has null text field", () => {
    const event = makeUserEvent([
      { type: "text", text: null },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });
});

describe("Bug 8: ToolCallBlock toolUse.name crash", () => {
  it("should not crash when tool_use has undefined name", () => {
    const event = makeAssistantEvent([
      { type: "tool_use", id: "tool-1", name: undefined, input: {} },
    ]);
    expect(() =>
      eventsToLogEntries([event], emptyAgents)
    ).not.toThrow();
  });
});
