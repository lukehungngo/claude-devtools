import { describe, it, expect } from "vitest";
import { eventsToLogEntries, buildTimelineGroups } from "./AgentLogs";
import { shortModelName } from "../lib/modelUtils";
import { calculateTurnCost } from "../lib/cost";
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

describe("eventsToLogEntries includes cache tokens in cost", () => {
  const agents: AgentNode[] = [];

  it("passes cache_creation and cache_read tokens to calculateTurnCost", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "cache1",
        timestamp: "2026-03-30T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } },
          ],
          model: "claude-sonnet-4-6",
          id: "msg_cache1",
          type: "message",
          stop_reason: "tool_use",
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 2000,
            cache_read_input_tokens: 3000,
          },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBe(1);

    // Expected cost includes cache tokens
    const expectedCost = calculateTurnCost("claude-sonnet-4-6", 1000, 500, 2000, 3000);
    // Cost without cache tokens (the bug)
    const costWithoutCache = calculateTurnCost("claude-sonnet-4-6", 1000, 500, 0, 0);
    // Sanity: cache tokens should make a difference
    expect(expectedCost).toBeGreaterThan(costWithoutCache);
    // The actual entry cost should match the full calculation
    expect(entries[0].cost).toBeCloseTo(expectedCost, 10);
  });
});

describe("model name propagation to TimelineGroup", () => {
  const agents: AgentNode[] = [];

  it("eventsToLogEntries carries model on log entries from assistant events", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "m1",
        timestamp: "2026-04-01T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } }],
          model: "claude-haiku-4-5-20251001",
          id: "msg_m1",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("buildTimelineGroups sets model from first assistant entry in the group", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "m2",
        timestamp: "2026-04-01T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "ls" } }],
          model: "claude-haiku-4-5-20251001",
          id: "msg_m2",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    const depthMap = new Map<string, number>();
    const groups = buildTimelineGroups(entries, depthMap);
    expect(groups.length).toBe(1);
    expect(groups[0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("shortModelName strips claude- prefix", () => {
    expect(shortModelName("claude-haiku-4-5-20251001")).toBe("haiku-4-5-20251001");
    expect(shortModelName("haiku-4-5-20251001")).toBe("haiku-4-5-20251001");
    expect(shortModelName("")).toBe("");
  });
});
