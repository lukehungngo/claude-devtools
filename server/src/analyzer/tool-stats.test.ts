import { describe, it, expect } from "vitest";
import { buildToolStats } from "./tool-stats.js";
import type { SessionEvent, AssistantEvent, UserEvent } from "../types.js";

function makeAssistantEvent(
  content: AssistantEvent["message"]["content"]
): AssistantEvent {
  return {
    type: "assistant",
    uuid: "uuid-" + Math.random().toString(36).slice(2),
    timestamp: "2026-03-23T10:00:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content,
      model: "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeUserEvent(
  content: UserEvent["message"]["content"]
): UserEvent {
  return {
    type: "user",
    uuid: "uuid-" + Math.random().toString(36).slice(2),
    timestamp: "2026-03-23T10:00:01Z",
    sessionId: "test-session",
    userType: "internal",
    message: { role: "user", content },
  };
}

describe("buildToolStats", () => {
  it("counts tool_use events by tool name", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Read", input: {} },
        { type: "tool_use", id: "t2", name: "Read", input: {} },
        { type: "tool_use", id: "t3", name: "Bash", input: {} },
      ]),
    ];

    const stats = buildToolStats(events);

    const readStat = stats.find((s) => s.name === "Read");
    const bashStat = stats.find((s) => s.name === "Bash");
    expect(readStat).toBeDefined();
    expect(readStat!.count).toBe(2);
    expect(bashStat).toBeDefined();
    expect(bashStat!.count).toBe(1);
  });

  it("tracks errors from tool_result events in user events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Bash", input: {} },
      ]),
      makeUserEvent([
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: "command failed",
          is_error: true,
        },
      ]),
    ];

    const stats = buildToolStats(events);

    const bashStat = stats.find((s) => s.name === "Bash");
    expect(bashStat).toBeDefined();
    expect(bashStat!.errors).toBe(1);
  });

  it("does not count non-error tool_results as errors", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Read", input: {} },
      ]),
      makeUserEvent([
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: "file contents",
          is_error: false,
        },
      ]),
    ];

    const stats = buildToolStats(events);

    const readStat = stats.find((s) => s.name === "Read");
    expect(readStat!.errors).toBe(0);
  });

  it("detects MCP tools (name starts with mcp__)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "mcp__myserver__mytool", input: {} },
      ]),
    ];

    const stats = buildToolStats(events);

    expect(stats[0].isMcp).toBe(true);
    expect(stats[0].mcpServer).toBe("myserver");
  });

  it("marks non-MCP tools correctly", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Read", input: {} },
      ]),
    ];

    const stats = buildToolStats(events);

    expect(stats[0].isMcp).toBe(false);
    expect(stats[0].mcpServer).toBeUndefined();
  });

  it("sorts results by count descending", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Read", input: {} },
        { type: "tool_use", id: "t2", name: "Bash", input: {} },
        { type: "tool_use", id: "t3", name: "Bash", input: {} },
        { type: "tool_use", id: "t4", name: "Bash", input: {} },
        { type: "tool_use", id: "t5", name: "Write", input: {} },
        { type: "tool_use", id: "t6", name: "Write", input: {} },
      ]),
    ];

    const stats = buildToolStats(events);

    expect(stats[0].name).toBe("Bash");
    expect(stats[0].count).toBe(3);
    expect(stats[1].name).toBe("Write");
    expect(stats[1].count).toBe(2);
    expect(stats[2].name).toBe("Read");
    expect(stats[2].count).toBe(1);
  });

  it("returns empty array for no events", () => {
    const stats = buildToolStats([]);
    expect(stats).toEqual([]);
  });

  it("ignores user events that are not tool_results", () => {
    const events: SessionEvent[] = [
      makeUserEvent([{ type: "text", text: "hello" }]),
    ];

    const stats = buildToolStats(events);
    expect(stats).toEqual([]);
  });

  it("handles multiple errors for the same tool", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        { type: "tool_use", id: "t1", name: "Bash", input: {} },
        { type: "tool_use", id: "t2", name: "Bash", input: {} },
      ]),
      makeUserEvent([
        { type: "tool_result", tool_use_id: "t1", content: "err", is_error: true },
        { type: "tool_result", tool_use_id: "t2", content: "err", is_error: true },
      ]),
    ];

    const stats = buildToolStats(events);

    const bashStat = stats.find((s) => s.name === "Bash");
    expect(bashStat!.count).toBe(2);
    expect(bashStat!.errors).toBe(2);
  });
});
