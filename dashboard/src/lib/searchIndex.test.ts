import { describe, it, expect } from "vitest";
import { buildSearchIndex, updateSearchIndex, filterTurnsByQuery } from "./searchIndex";
import type { TurnSnapshot } from "./turnSnapshot";
import type { SessionEvent, UserEvent, AssistantEvent } from "./types";

function makeUserEvent(text: string): UserEvent {
  return {
    type: "user",
    uuid: `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: "2026-01-01T00:00:00Z",
    sessionId: "sess-1",
    userType: "external",
    message: { role: "user", content: [{ type: "text" as const, text }] },
  } as UserEvent;
}

function makeAssistantEvent(text: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: `asst-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: "2026-01-01T00:00:01Z",
    sessionId: "sess-1",
    agentId: "main",
    message: {
      role: "assistant",
      content: [{ type: "text" as const, text }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  } as AssistantEvent;
}

function makeTurn(turnNumber: number, promptText: string, startIndex: number, endIndex: number): TurnSnapshot {
  return {
    turnNumber,
    promptText,
    startIndex,
    endIndex,
    agents: [],
    durationMs: null,
    cost: 0,
    costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
    inputTokens: 0,
    outputTokens: 0,
    startTime: "",
    endTime: "",
    dispatchedAgentIds: new Set<string>(["main"]),
  };
}

describe("buildSearchIndex", () => {
  it("builds a Map from turnNumber to lowercase searchable text", () => {
    const allEvents: SessionEvent[] = [
      makeUserEvent("Hello World"),
      makeAssistantEvent("Goodbye Moon"),
      makeUserEvent("Foo Bar"),
      makeAssistantEvent("Baz Qux"),
    ];
    const turns: TurnSnapshot[] = [
      makeTurn(1, "Hello World", 0, 2),
      makeTurn(2, "Foo Bar", 2, 4),
    ];
    const index = buildSearchIndex(turns, allEvents);
    expect(index.size).toBe(2);
    expect(index.get(1)).toContain("hello world");
    expect(index.get(1)).toContain("goodbye moon");
    expect(index.get(2)).toContain("foo bar");
    expect(index.get(2)).toContain("baz qux");
  });
});

describe("updateSearchIndex", () => {
  it("adds new turns to existing index without rebuilding old entries", () => {
    const existingIndex = new Map<number, string>();
    existingIndex.set(1, "hello world goodbye moon");
    const allEvents: SessionEvent[] = [
      makeUserEvent("Hello World"),
      makeAssistantEvent("Goodbye Moon"),
      makeUserEvent("New Turn"),
      makeAssistantEvent("New Response"),
    ];
    const newTurns: TurnSnapshot[] = [
      makeTurn(2, "New Turn", 2, 4),
    ];
    const updated = updateSearchIndex(existingIndex, newTurns, allEvents);
    expect(updated.size).toBe(2);
    expect(updated.get(1)).toBe("hello world goodbye moon"); // unchanged
    expect(updated.get(2)).toContain("new turn");
    expect(updated.get(2)).toContain("new response");
  });

  it("updates existing turn entry when events change", () => {
    const existingIndex = new Map<number, string>();
    existingIndex.set(1, "old text");
    const allEvents: SessionEvent[] = [
      makeUserEvent("Updated Prompt"),
      makeAssistantEvent("Updated Response"),
    ];
    const updatedTurns: TurnSnapshot[] = [
      makeTurn(1, "Updated Prompt", 0, 2),
    ];
    const updated = updateSearchIndex(existingIndex, updatedTurns, allEvents);
    expect(updated.get(1)).toContain("updated prompt");
    expect(updated.get(1)).toContain("updated response");
  });
});

describe("filterTurnsByQuery", () => {
  it("returns all turns when query is empty", () => {
    const turns: TurnSnapshot[] = [
      makeTurn(1, "Hello", 0, 0),
      makeTurn(2, "World", 0, 0),
    ];
    const index = new Map<number, string>();
    index.set(1, "hello");
    index.set(2, "world");
    expect(filterTurnsByQuery(turns, index, "")).toEqual(turns);
    expect(filterTurnsByQuery(turns, index, "  ")).toEqual(turns);
  });

  it("filters turns by query match in search index", () => {
    const turn1 = makeTurn(1, "Hello", 0, 0);
    const turn2 = makeTurn(2, "World", 0, 0);
    const turns = [turn1, turn2];
    const index = new Map<number, string>();
    index.set(1, "hello greeting");
    index.set(2, "world planet");
    expect(filterTurnsByQuery(turns, index, "planet")).toEqual([turn2]);
    expect(filterTurnsByQuery(turns, index, "hello")).toEqual([turn1]);
  });

  it("is case-insensitive", () => {
    const turn1 = makeTurn(1, "Hello", 0, 0);
    const turns = [turn1];
    const index = new Map<number, string>();
    index.set(1, "hello world");
    expect(filterTurnsByQuery(turns, index, "HELLO")).toEqual([turn1]);
  });
});
