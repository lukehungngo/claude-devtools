import { describe, it, expect } from "vitest";
import { detectBlindEdits } from "../blind-edits.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeToolUse(name: string, input: Record<string, unknown>, uuid: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `tu_${uuid}`, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeSession(id: string, events: AssistantEvent[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectBlindEdits", () => {
  it("flags Edit without prior Read of same file", () => {
    // Need >= 3 total edits and < 70% with read to trigger
    const events = [
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" }, "1"),
      makeToolUse("Edit", { file_path: "/src/b.ts", old_string: "a", new_string: "b" }, "2"),
      makeToolUse("Edit", { file_path: "/src/c.ts", old_string: "a", new_string: "b" }, "3"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.evidence.stats.blindEdits).toBe(3);
  });

  it("does not flag Edit when Read of same file precedes it", () => {
    const events = [
      makeToolUse("Read", { file_path: "/src/a.ts" }, "1"),
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" }, "2"),
      makeToolUse("Read", { file_path: "/src/b.ts" }, "3"),
      makeToolUse("Edit", { file_path: "/src/b.ts", old_string: "a", new_string: "b" }, "4"),
      makeToolUse("Read", { file_path: "/src/c.ts" }, "5"),
      makeToolUse("Edit", { file_path: "/src/c.ts", old_string: "a", new_string: "b" }, "6"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("only looks back 10 events for the Read", () => {
    const filler = Array.from({ length: 11 }, (_, i) =>
      makeToolUse("Bash", { command: `cmd${i}` }, `f${i}`)
    );
    const events = [
      makeToolUse("Read", { file_path: "/src/a.ts" }, "r1"),
      ...filler,
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" }, "e1"),
      makeToolUse("Edit", { file_path: "/src/b.ts", old_string: "a", new_string: "b" }, "e2"),
      makeToolUse("Edit", { file_path: "/src/c.ts", old_string: "a", new_string: "b" }, "e3"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectBlindEdits([]);
    expect(result.detected).toBe(false);
  });

  it("measures first-try success: follow-up edit on same file counts as failure", () => {
    // Edit a.ts, then edit a.ts again within 5 tool calls = first try failure
    // Edit b.ts (no follow-up) = first try success
    const events = [
      makeToolUse("Read", { file_path: "/src/a.ts" }, "r1"),
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" }, "e1"),
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "b", new_string: "c" }, "e2"), // follow-up fix
      makeToolUse("Read", { file_path: "/src/b.ts" }, "r2"),
      makeToolUse("Edit", { file_path: "/src/b.ts", old_string: "x", new_string: "y" }, "e3"), // no follow-up
      makeToolUse("Edit", { file_path: "/src/c.ts", old_string: "x", new_string: "y" }, "e4"), // blind, no follow-up
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    // Stats should have firstTrySuccessWithRead and firstTrySuccessWithoutRead
    expect(result.evidence.stats).toHaveProperty("firstTrySuccessWithRead");
    expect(result.evidence.stats).toHaveProperty("firstTrySuccessWithoutRead");
    // With read: a.ts-e1 (fail, follow-up e2), a.ts-e2 (success, Read still in lookback), b.ts (success) => 2/3 = 67%
    expect(result.evidence.stats.firstTrySuccessWithRead).toBe(67);
    // Without read: c.ts (success, no follow-up) => 100%
    expect(result.evidence.stats.firstTrySuccessWithoutRead).toBe(100);
  });

  it("punchline includes real success rates when detected", () => {
    // All blind edits, some with follow-up fixes
    const events = [
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" }, "e1"),
      makeToolUse("Edit", { file_path: "/src/a.ts", old_string: "b", new_string: "c" }, "e2"),
      makeToolUse("Edit", { file_path: "/src/b.ts", old_string: "x", new_string: "y" }, "e3"),
      makeToolUse("Edit", { file_path: "/src/c.ts", old_string: "x", new_string: "y" }, "e4"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    // Punchline should mention success rates
    expect(result.punchline).toMatch(/succeeded.*%/i);
  });
});
