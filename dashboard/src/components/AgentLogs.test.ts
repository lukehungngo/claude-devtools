import { describe, it, expect } from "vitest";
import { eventsToLogEntries } from "./AgentLogs";
import type { SessionEvent, AgentNode } from "../lib/types";

describe("eventsToLogEntries handles string content (bug fix)", () => {
  const agents: AgentNode[] = [];

  it("does not crash when assistant event has string content", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        requestId: "r1",
        message: {
          role: "assistant",
          // Real JSONL data can have string content
          content: "Hello, how can I help?" as unknown as any,
          model: "claude-opus-4-20250514",
          id: "msg_1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      },
    ];

    // Before fix: crashes with "content is not iterable"
    // After fix: should produce a log entry with the string content
    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].message).toContain("Hello");
  });

  it("does not crash when user event has string content", () => {
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        userType: "external",
        message: {
          role: "user",
          content: "Fix the bug in main.ts" as unknown as any,
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].message).toContain("Fix the bug");
  });

  it("does not crash when content is undefined", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a2",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: undefined as unknown as any,
          model: "claude-opus-4-20250514",
          id: "msg_2",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries).toEqual([]);
  });

  it("still works with normal array content", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a3",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Here is the answer" },
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } },
          ],
          model: "claude-opus-4-20250514",
          id: "msg_3",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBe(2);
  });

  it("handles tool_result with object content instead of string", () => {
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u2",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        userType: "internal",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              // In real data, content could be an object
              content: { type: "text", text: "file contents here" } as unknown as string,
              is_error: false,
            },
          ],
        },
      },
    ];

    // Before fix: "Objects are not valid as a React child"
    // After fix: should not crash and produce a string message
    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBe(1);
    expect(typeof entries[0].message).toBe("string");
  });
});
