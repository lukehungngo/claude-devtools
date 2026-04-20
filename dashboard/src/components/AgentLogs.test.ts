import { describe, it, expect } from "vitest";
import { eventsToLogEntries, buildTimelineGroups, getActionBadgeStyle } from "./AgentLogs";
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
        tokensIn: 0,
        tokensOut: 0,
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
        tokensIn: 0,
        tokensOut: 0,
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
        tokensIn: 0,
        tokensOut: 0,
      },
    ];
    const depthMap = new Map([["main", 0]]);
    const groups = buildTimelineGroups(entries, depthMap);
    expect(groups[0].model).toBeUndefined();
  });
});

describe("AgentLogs token tracking", () => {
  const agents: AgentNode[] = [];

  it("carries full tokensIn/tokensOut from an assistant event (sum across entries equals event total)", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-04-17T00:00:00Z",
        sessionId: "s1",
        requestId: "r1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "thinking..." }],
          model: "claude-opus-4-7",
          id: "msg_1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      } as any,
    ];
    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // Sum across all entries for this event should equal the event's token counts
    const totalIn = entries.reduce((s, e) => s + e.tokensIn, 0);
    const totalOut = entries.reduce((s, e) => s + e.tokensOut, 0);
    expect(totalIn).toBe(500);
    expect(totalOut).toBe(200);
  });

  it("accumulates tokensIn/tokensOut in TimelineGroup", () => {
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-04-17T00:00:00Z",
        sessionId: "s1",
        requestId: "r1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "step 1" }],
          model: "claude-opus-4-7",
          id: "msg_1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 300, output_tokens: 100 },
        },
      } as any,
      {
        type: "assistant",
        uuid: "a2",
        timestamp: "2026-04-17T00:01:00Z",
        sessionId: "s1",
        requestId: "r2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "step 2" }],
          model: "claude-opus-4-7",
          id: "msg_2",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 200, output_tokens: 80 },
        },
      } as any,
    ];
    const entries = eventsToLogEntries(events, agents);
    const depthMap = new Map([["main", 0]]);
    const groups = buildTimelineGroups(entries, depthMap);
    expect(groups.length).toBe(1);
    expect(groups[0].tokensIn).toBe(500);
    expect(groups[0].tokensOut).toBe(180);
  });

  it("sets tokensIn=0/tokensOut=0 for non-assistant entries", () => {
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-04-17T00:00:00Z",
        sessionId: "s1",
        userType: "external",
        message: { role: "user", content: "hello" as unknown as any },
      } as any,
    ];
    const entries = eventsToLogEntries(events, agents);
    entries.forEach((e) => {
      expect(e.tokensIn).toBe(0);
      expect(e.tokensOut).toBe(0);
    });
  });
});

describe("getActionBadgeStyle (redesigned filled badges)", () => {
  it("returns null for null tool name", () => {
    expect(getActionBadgeStyle(null)).toBeNull();
  });
  it("think → resp-think vars", () => {
    const s = getActionBadgeStyle("thinking");
    expect(s).not.toBeNull();
    expect(s!.bg).toBe("var(--resp-think-bg)");
    expect(s!.color).toBe("var(--resp-think)");
    expect(s!.label).toBe("think");
  });
  it("Bash → resp-tool vars", () => {
    const s = getActionBadgeStyle("Bash");
    expect(s!.bg).toBe("var(--resp-tool-bg)");
    expect(s!.color).toBe("var(--resp-tool)");
    expect(s!.label).toBe("Bash");
  });
  it("Read → resp-tool vars", () => {
    const s = getActionBadgeStyle("Read");
    expect(s!.bg).toBe("var(--resp-tool-bg)");
    expect(s!.color).toBe("var(--resp-tool)");
  });
  it("Write → grn vars", () => {
    const s = getActionBadgeStyle("Write");
    expect(s!.bg).toBe("var(--grn-bg)");
    expect(s!.color).toBe("var(--grn)");
  });
  it("Edit → grn vars", () => {
    const s = getActionBadgeStyle("Edit");
    expect(s!.bg).toBe("var(--grn-bg)");
    expect(s!.color).toBe("var(--grn)");
  });
  it("error → red vars", () => {
    const s = getActionBadgeStyle("error");
    expect(s!.bg).toBe("var(--red-bg)");
    expect(s!.color).toBe("var(--red)");
  });
  it("result → bg-s + border + t2", () => {
    const s = getActionBadgeStyle("result");
    expect(s!.bg).toBe("var(--bg-s)");
    expect(s!.color).toBe("var(--t2)");
    expect(s!.border).toBe("1px solid var(--bd)");
  });
  it("spawn → resp-dispatch vars", () => {
    const s = getActionBadgeStyle("spawn");
    expect(s!.bg).toBe("var(--resp-dispatch-bg)");
    expect(s!.color).toBe("var(--resp-dispatch)");
  });
  it("unknown tool → resp-tool vars (purple fallback)", () => {
    const s = getActionBadgeStyle("SomeTool");
    expect(s!.bg).toBe("var(--resp-tool-bg)");
    expect(s!.color).toBe("var(--resp-tool)");
  });
  it("long unknown tool truncated to 12 chars + ellipsis", () => {
    const s = getActionBadgeStyle("VeryLongToolName");
    expect(s!.label).toBe("VeryLongTool\u2026");
  });
});
