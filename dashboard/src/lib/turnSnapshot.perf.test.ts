import { describe, it, expect } from "vitest";
import { groupEventsIntoTurns, getEventsForTurn } from "./turnSnapshot";
import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
} from "./types";

// ─── Test helpers ────────────────────────────────────────────────────

function makeUserEvent(
  overrides: Partial<UserEvent> & { text?: string } = {}
): UserEvent {
  return {
    type: "user",
    uuid: overrides.uuid ?? `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00Z",
    sessionId: overrides.sessionId ?? "sess-1",
    userType: overrides.userType ?? "external",
    message: {
      role: "user",
      content: [{ type: "text" as const, text: overrides.text ?? "hello" }],
    },
  } as UserEvent;
}

function makeAssistantEvent(
  overrides: Partial<AssistantEvent> & {
    inputTokens?: number;
    outputTokens?: number;
  } = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid ?? `asst-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:01Z",
    sessionId: overrides.sessionId ?? "sess-1",
    agentId: overrides.agentId ?? "main",
    message: {
      role: "assistant",
      content: [{ type: "text" as const, text: "response" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: overrides.inputTokens ?? 100,
        output_tokens: overrides.outputTokens ?? 50,
      },
    },
  } as AssistantEvent;
}

function makeTurnDurationEvent(
  durationMs: number,
  overrides: Partial<SystemEvent> = {}
): SystemEvent {
  return {
    type: "system",
    uuid: overrides.uuid ?? `sys-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:10Z",
    sessionId: overrides.sessionId ?? "sess-1",
    subtype: "turn_duration",
    durationMs,
  } as SystemEvent;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("TurnSnapshot event index ranges", () => {
  it("stores startIndex and endIndex instead of copying the events array", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeTurnDurationEvent(3000, { timestamp: "2026-01-01T00:00:05Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:01Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    expect(turns[0].startIndex).toBe(0);
    expect(turns[0].endIndex).toBe(3);
    expect(turns[1].startIndex).toBe(3);
    expect(turns[1].endIndex).toBe(5);
  });

  it("getEventsForTurn slices from the shared allEvents array", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:01Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    const turn1Events = getEventsForTurn(turns[0], events);
    expect(turn1Events).toHaveLength(2);
    expect(turn1Events[0]).toBe(events[0]); // same reference
    expect(turn1Events[1]).toBe(events[1]);

    const turn2Events = getEventsForTurn(turns[1], events);
    expect(turn2Events).toHaveLength(2);
    expect(turn2Events[0]).toBe(events[2]);
    expect(turn2Events[1]).toBe(events[3]);
  });

  it("turn.events still works for backward compatibility", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    // events property still populated for backward compat
    expect(turns[0].events).toHaveLength(2);
  });

  it("single turn covers entire events array", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].startIndex).toBe(0);
    expect(turns[0].endIndex).toBe(3);
  });
});

describe("TurnCard memo comparator fields", () => {
  it("TurnSnapshot has index and eventsLength for memo comparison", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    // turnNumber used as stable identity for memo
    expect(typeof turns[0].turnNumber).toBe("number");
    // status used for memo
    expect(typeof turns[0].status).toBe("string");
    // events.length used for memo (backward compat)
    expect(typeof turns[0].events.length).toBe("number");
    // durationMs used for memo
    expect(turns[0].durationMs === null || typeof turns[0].durationMs === "number").toBe(true);
  });
});
