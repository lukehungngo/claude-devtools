import { describe, it, expect } from "vitest";
import { eventsToLogEntries, buildTimelineGroups } from "./AgentLogs";
import { calculateTurnCost } from "../lib/cost";
import type { SessionEvent, AgentNode } from "../lib/types";
import type { LogEntry } from "./AgentLogs";

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

describe("model propagation through eventsToLogEntries and buildTimelineGroups", () => {
  const agents: AgentNode[] = [];

  it("eventsToLogEntries stores model from assistant event", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          model: "claude-sonnet-4-6",
          id: "msg_1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      } as unknown as SessionEvent,
    ];
    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].model).toBe("claude-sonnet-4-6");
  });

  it("buildTimelineGroups propagates model from first entry to group", () => {
    const entries: LogEntry[] = [
      {
        uuid: "e1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "agent1",
        agentType: "engineer",
        model: "claude-sonnet-4-6",
        message: "msg",
        toolName: null,
        isError: false,
        cost: 0,
      },
      {
        uuid: "e2",
        timestamp: "2026-01-01T00:00:01Z",
        agentId: "agent1",
        agentType: "engineer",
        model: "claude-sonnet-4-6",
        message: "msg2",
        toolName: null,
        isError: false,
        cost: 0,
      },
    ];
    const depthMap = new Map([["agent1", 0]]);
    const groups = buildTimelineGroups(entries, depthMap);
    expect(groups.length).toBe(1);
    expect(groups[0].model).toBe("claude-sonnet-4-6");
  });

  it("buildTimelineGroups leaves model undefined when entry has no model", () => {
    const entries: LogEntry[] = [
      {
        uuid: "e1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "main",
        agentType: "orchestrator",
        model: undefined,
        message: "msg",
        toolName: null,
        isError: false,
        cost: 0,
      },
    ];
    const depthMap = new Map([["main", 0]]);
    const groups = buildTimelineGroups(entries, depthMap);
    expect(groups[0].model).toBeUndefined();
  });
});
