import { describe, it, expect } from "vitest";
import { generateMarkdownExport, generateJsonExport } from "./exportSession";
import type { SessionEvent, AssistantEvent, UserEvent } from "./types";

function makeUserEvent(text: string, timestamp = "2026-01-01T00:00:00Z"): UserEvent {
  return {
    type: "user",
    uuid: "u-" + text.slice(0, 4),
    timestamp,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  };
}

function makeAssistantEvent(
  text: string,
  timestamp = "2026-01-01T00:00:01Z",
  model = "claude-sonnet-4-6"
): AssistantEvent {
  return {
    type: "assistant",
    uuid: "a-" + text.slice(0, 4),
    timestamp,
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      model,
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

describe("generateMarkdownExport", () => {
  it("generates markdown with session header", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Hello"),
      makeAssistantEvent("Hi there"),
    ];
    const result = generateMarkdownExport(events, "test-session");
    expect(result).toContain("# Session Export: test-session");
  });

  it("includes user and assistant messages as turns", () => {
    const events: SessionEvent[] = [
      makeUserEvent("What is 2+2?"),
      makeAssistantEvent("The answer is 4."),
    ];
    const result = generateMarkdownExport(events, "s1");
    expect(result).toContain("**User:**");
    expect(result).toContain("What is 2+2?");
    expect(result).toContain("**Assistant:**");
    expect(result).toContain("The answer is 4.");
  });

  it("handles multiple turns", () => {
    const events: SessionEvent[] = [
      makeUserEvent("First question", "2026-01-01T00:00:00Z"),
      makeAssistantEvent("First answer", "2026-01-01T00:00:01Z"),
      makeUserEvent("Second question", "2026-01-01T00:01:00Z"),
      makeAssistantEvent("Second answer", "2026-01-01T00:01:01Z"),
    ];
    const result = generateMarkdownExport(events, "s1");
    expect(result).toContain("## Turn 1");
    expect(result).toContain("## Turn 2");
    expect(result).toContain("First question");
    expect(result).toContain("Second answer");
  });

  it("returns minimal output for empty events", () => {
    const result = generateMarkdownExport([], "empty-session");
    expect(result).toContain("# Session Export: empty-session");
    // Should not contain any turn headers
    expect(result).not.toContain("## Turn");
  });

  it("handles string content in events", () => {
    const userEvent: UserEvent = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-01-01T00:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: "plain string prompt" },
    };
    const events: SessionEvent[] = [userEvent];
    const result = generateMarkdownExport(events, "s1");
    expect(result).toContain("plain string prompt");
  });

  it("includes tool use information", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Read file"),
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:01Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me read that." },
            { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "/tmp/test.ts" } },
          ],
          model: "claude-sonnet-4-6",
          id: "msg-1",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      } as AssistantEvent,
    ];
    const result = generateMarkdownExport(events, "s1");
    expect(result).toContain("Tool: Read");
  });
});

describe("generateJsonExport", () => {
  it("produces valid JSON with sessionId and exportedAt", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Hello"),
      makeAssistantEvent("Hi"),
    ];
    const result = generateJsonExport(events, "test-session");
    const parsed = JSON.parse(result);
    expect(parsed.sessionId).toBe("test-session");
    expect(parsed.exportedAt).toBeTruthy();
  });

  it("includes all events in the output", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Q1"),
      makeAssistantEvent("A1"),
      makeUserEvent("Q2"),
      makeAssistantEvent("A2"),
    ];
    const result = generateJsonExport(events, "s1");
    const parsed = JSON.parse(result);
    expect(parsed.events).toHaveLength(4);
  });

  it("returns valid JSON for empty events", () => {
    const result = generateJsonExport([], "empty");
    const parsed = JSON.parse(result);
    expect(parsed.events).toHaveLength(0);
    expect(parsed.sessionId).toBe("empty");
  });

  it("preserves event structure", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("response text"),
    ];
    const result = generateJsonExport(events, "s1");
    const parsed = JSON.parse(result);
    expect(parsed.events[0].type).toBe("assistant");
    expect(parsed.events[0].message.content[0].text).toBe("response text");
  });
});
