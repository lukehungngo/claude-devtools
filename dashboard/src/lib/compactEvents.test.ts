import { describe, it, expect } from "vitest";
import type { SessionEvent, SystemEvent, UserEvent, AssistantEvent } from "./types";
import { groupEventsIntoTurns } from "./turnSnapshot";
import { extractCompactMarkers } from "./compactEvents";

function userTurn(uuid: string, ts: string, text: string): UserEvent {
  return {
    type: "user",
    uuid,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

function assistant(uuid: string, ts: string, text: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      model: "claude-sonnet-4-5-20250929",
      id: "m-" + uuid,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as unknown as AssistantEvent["message"],
  };
}

function compactBoundary(
  uuid: string,
  ts: string,
  metadata: {
    trigger: string;
    preTokens: number;
    postTokens?: number;
    durationMs?: number;
    preCompactDiscoveredTools?: string[];
  },
): SystemEvent {
  return {
    type: "system",
    uuid,
    timestamp: ts,
    sessionId: "s1",
    subtype: "compact_boundary",
    // Real CC JSONL field; not yet on SystemEvent global type
    ...({ compactMetadata: metadata } as Record<string, unknown>),
  } as SystemEvent;
}

describe("extractCompactMarkers", () => {
  it("returns empty array when no compact_boundary events present", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "hello"),
      assistant("a1", "2026-05-16T10:00:01Z", "hi"),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(extractCompactMarkers(events, turns)).toEqual([]);
  });

  it("returns marker rows for compact_boundary events between turns", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "first prompt"),
      assistant("a1", "2026-05-16T10:00:01Z", "response 1"),
      compactBoundary("c1", "2026-05-16T10:00:30Z", {
        trigger: "auto",
        preTokens: 168000,
        postTokens: 9000,
        durationMs: 60800,
      }),
      userTurn("u2", "2026-05-16T10:01:00Z", "second prompt"),
      assistant("a2", "2026-05-16T10:01:01Z", "response 2"),
    ];
    const turns = groupEventsIntoTurns(events);
    const markers = extractCompactMarkers(events, turns);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      uuid: "c1",
      turnNumber: 1, // appears AFTER turn 1, BEFORE turn 2
      trigger: "auto",
      preTokens: 168000,
      postTokens: 9000,
      durationMs: 60800,
    });
  });

  it("captures preCompactDiscoveredTools when present", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "prompt"),
      assistant("a1", "2026-05-16T10:00:01Z", "r"),
      compactBoundary("c1", "2026-05-16T10:00:30Z", {
        trigger: "manual",
        preTokens: 50000,
        postTokens: 2000,
        preCompactDiscoveredTools: ["Read", "Write", "Bash"],
      }),
      userTurn("u2", "2026-05-16T10:01:00Z", "next"),
    ];
    const turns = groupEventsIntoTurns(events);
    const markers = extractCompactMarkers(events, turns);
    expect(markers).toHaveLength(1);
    expect(markers[0].preCompactDiscoveredTools).toEqual(["Read", "Write", "Bash"]);
    expect(markers[0].trigger).toBe("manual");
  });

  it("returns multiple markers when two compact_boundary events sit in the same gap", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "p1"),
      assistant("a1", "2026-05-16T10:00:01Z", "r1"),
      compactBoundary("c1", "2026-05-16T10:00:30Z", { trigger: "auto", preTokens: 100 }),
      compactBoundary("c2", "2026-05-16T10:00:31Z", { trigger: "manual", preTokens: 50 }),
      userTurn("u2", "2026-05-16T10:01:00Z", "p2"),
    ];
    const turns = groupEventsIntoTurns(events);
    const markers = extractCompactMarkers(events, turns);
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.uuid)).toEqual(["c1", "c2"]);
    expect(markers.map((m) => m.turnNumber)).toEqual([1, 1]);
  });

  it("ignores compact_boundary that arrives BEFORE the first turn", () => {
    const events: SessionEvent[] = [
      compactBoundary("c0", "2026-05-16T09:59:00Z", { trigger: "auto", preTokens: 10 }),
      userTurn("u1", "2026-05-16T10:00:00Z", "p1"),
      assistant("a1", "2026-05-16T10:00:01Z", "r1"),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(extractCompactMarkers(events, turns)).toEqual([]);
  });

  it("ignores non-compact_boundary system events", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "p1"),
      assistant("a1", "2026-05-16T10:00:01Z", "r1"),
      {
        type: "system",
        uuid: "s1",
        timestamp: "2026-05-16T10:00:02Z",
        sessionId: "s1",
        subtype: "turn_duration",
        durationMs: 1000,
      } as SystemEvent,
      userTurn("u2", "2026-05-16T10:01:00Z", "p2"),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(extractCompactMarkers(events, turns)).toEqual([]);
  });

  it("falls back to snake_case pre_compact_discovered_tools if camelCase missing", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "p1"),
      assistant("a1", "2026-05-16T10:00:01Z", "r1"),
      {
        type: "system",
        uuid: "c1",
        timestamp: "2026-05-16T10:00:30Z",
        sessionId: "s1",
        subtype: "compact_boundary",
        ...({
          compactMetadata: {
            trigger: "auto",
            preTokens: 100,
            pre_compact_discovered_tools: ["X", "Y"],
          },
        } as Record<string, unknown>),
      } as SystemEvent,
      userTurn("u2", "2026-05-16T10:01:00Z", "p2"),
    ];
    const turns = groupEventsIntoTurns(events);
    const markers = extractCompactMarkers(events, turns);
    expect(markers).toHaveLength(1);
    expect(markers[0].preCompactDiscoveredTools).toEqual(["X", "Y"]);
  });

  it("skips compact_boundary missing compactMetadata entirely (cannot render)", () => {
    const events: SessionEvent[] = [
      userTurn("u1", "2026-05-16T10:00:00Z", "p1"),
      assistant("a1", "2026-05-16T10:00:01Z", "r1"),
      {
        type: "system",
        uuid: "c1",
        timestamp: "2026-05-16T10:00:30Z",
        sessionId: "s1",
        subtype: "compact_boundary",
      } as SystemEvent,
      userTurn("u2", "2026-05-16T10:01:00Z", "p2"),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(extractCompactMarkers(events, turns)).toEqual([]);
  });
});
