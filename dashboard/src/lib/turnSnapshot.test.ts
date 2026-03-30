import { describe, it, expect } from "vitest";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental } from "./turnSnapshot";
import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
  ProgressEvent,
} from "./types";

// ─── Test helpers ────────────────────────────────────────────────────

function makeUserEvent(
  overrides: Partial<UserEvent> & { text?: string; toolResult?: boolean }
): UserEvent {
  const content = overrides.toolResult
    ? [{ type: "tool_result" as const, tool_use_id: "t1", content: "ok" }]
    : overrides.text
      ? [{ type: "text" as const, text: overrides.text }]
      : [{ type: "text" as const, text: "hello" }];

  return {
    type: "user",
    uuid: overrides.uuid ?? `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00Z",
    sessionId: overrides.sessionId ?? "sess-1",
    userType: overrides.userType ?? "external",
    message: {
      role: "user",
      content: overrides.message?.content ?? content,
    },
    ...overrides,
  } as UserEvent;
}

function makeAssistantEvent(
  overrides: Partial<AssistantEvent> & {
    inputTokens?: number;
    outputTokens?: number;
    stopReason?: "end_turn" | "tool_use" | null;
  } = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid:
      overrides.uuid ??
      `asst-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:01Z",
    sessionId: overrides.sessionId ?? "sess-1",
    agentId: overrides.agentId ?? "main",
    message: {
      role: "assistant",
      content: overrides.message?.content ?? [
        { type: "text" as const, text: "response" },
      ],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: overrides.stopReason ?? "end_turn",
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
    ...overrides,
  } as SystemEvent;
}

function makeSystemEvent(
  subtype: string,
  overrides: Partial<SystemEvent> = {}
): SystemEvent {
  return {
    type: "system",
    uuid: overrides.uuid ?? `sys-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:10Z",
    sessionId: overrides.sessionId ?? "sess-1",
    subtype,
    ...overrides,
  } as SystemEvent;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("groupEventsIntoTurns", () => {
  it("returns empty array for empty events", () => {
    expect(groupEventsIntoTurns([])).toEqual([]);
  });

  it("creates one turn from a single external user event", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "What is 2+2?", timestamp: "2026-01-01T00:00:00Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[0].promptText).toBe("What is 2+2?");
    expect(turns[0].events).toHaveLength(1);
  });

  it("splits events into multiple turns at external user events with text", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: "Turn 1 prompt",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({
        text: "Turn 2 prompt",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:03Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[0].promptText).toBe("Turn 1 prompt");
    expect(turns[0].events).toHaveLength(2);
    expect(turns[1].turnNumber).toBe(2);
    expect(turns[1].promptText).toBe("Turn 2 prompt");
    expect(turns[1].events).toHaveLength(2);
  });

  it("does NOT split at internal user events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: "Turn 1",
        userType: "external",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({
        text: "internal msg",
        userType: "internal",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:03Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].events).toHaveLength(4);
  });

  it("does NOT split at user events with only tool_result content", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: "Turn 1",
        userType: "external",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({
        toolResult: true,
        userType: "external",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:03Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].events).toHaveLength(4);
  });

  it("computes agent summaries with unique agents and invocation counts", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeAssistantEvent({
        agentId: "agent-explore-1",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    const agents = turns[0].agents;
    expect(agents).toHaveLength(2);
    const mainAgent = agents.find((a) => a.agentId === "main");
    expect(mainAgent).toBeDefined();
    expect(mainAgent!.invocationCount).toBe(2);
    const exploreAgent = agents.find(
      (a) => a.agentId === "agent-explore-1"
    );
    expect(exploreAgent).toBeDefined();
    expect(exploreAgent!.invocationCount).toBe(1);
  });

  it("computes cost from assistant event token usage", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        inputTokens: 1000,
        outputTokens: 500,
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeAssistantEvent({
        inputTokens: 2000,
        outputTokens: 1000,
        timestamp: "2026-01-01T00:00:02Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    // Cost = (1000+2000)*0.000003 + (500+1000)*0.000015 = 0.009 + 0.0225 = 0.0315
    expect(turns[0].cost).toBeCloseTo(0.0315, 4);
  });

  it("detects running status when last event is not end_turn", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].status).toBe("running");
  });

  it("stop_reason end_turn alone does NOT complete a turn (requires turn_duration)", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].status).toBe("running");
    expect(turns[0].durationMs).toBeNull();
  });

  it("handles events before any external user event as turn 1", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[0].promptText).toBe("");
    expect(turns[0].events).toHaveLength(2);
  });

  it("sets startTime and endTime from first and last event timestamps", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: "Go",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].startTime).toBe("2026-01-01T00:00:00Z");
    expect(turns[0].endTime).toBe("2026-01-01T00:00:05Z");
  });
});

describe("groupEventsIntoTurns with agentMeta", () => {
  it("propagates agentType from agentMeta into agent summaries", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeAssistantEvent({
        agentId: "agent-explore-abc",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({
        agentId: "agent-plan-def",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    const agentMeta = {
      "agent-explore-abc": { agentType: "Explore", description: "explores code" },
      "agent-plan-def": { agentType: "Plan", description: "plans work" },
    };
    const turns = groupEventsIntoTurns(events, agentMeta);
    expect(turns).toHaveLength(1);
    const agents = turns[0].agents;
    expect(agents).toHaveLength(3);
    expect(agents.find((a) => a.agentId === "main")!.agentType).toBe("main");
    expect(agents.find((a) => a.agentId === "agent-explore-abc")!.agentType).toBe("Explore");
    expect(agents.find((a) => a.agentId === "agent-plan-def")!.agentType).toBe("Plan");
  });

  it("falls back to agentId when agentMeta is not provided", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "agent-unknown-xyz",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    const unknownAgent = turns[0].agents.find((a) => a.agentId === "agent-unknown-xyz");
    expect(unknownAgent).toBeDefined();
    expect(unknownAgent!.agentType).toBe("agent-unknown-xyz");
  });
});

describe("groupEventsIntoTurns — turn status state machine (turn_duration)", () => {
  it("turn with system/turn_duration event has status completed and durationMs set", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeTurnDurationEvent(5200, { timestamp: "2026-01-01T00:00:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBe(5200);
  });

  it("turn without system/turn_duration event has status running and durationMs null", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("running");
    expect(turns[0].durationMs).toBeNull();
  });

  it("non-last turn without turn_duration stays running (queue scenario)", () => {
    // Turn 1: user + assistant (no turn_duration — queued/interrupted)
    // Turn 2: user + assistant + turn_duration
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:05Z" }),
      makeTurnDurationEvent(4000, { timestamp: "2026-01-01T00:01:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    // Turn 1 has no turn_duration event — stays running
    expect(turns[0].status).toBe("running");
    expect(turns[0].durationMs).toBeNull();
    // Turn 2 has turn_duration — completed
    expect(turns[1].status).toBe("completed");
    expect(turns[1].durationMs).toBe(4000);
  });

  it("durationMs comes from the turn_duration event, not from timestamp math", () => {
    // Timestamps span 30 seconds, but turn_duration says 1234ms
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:30Z" }),
      makeTurnDurationEvent(1234, { timestamp: "2026-01-01T00:00:30Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].durationMs).toBe(1234);
    expect(turns[0].durationMs).not.toBe(30000);
  });

  it("system events with other subtypes do not trigger completion", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeSystemEvent("init", { timestamp: "2026-01-01T00:00:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("running");
    expect(turns[0].durationMs).toBeNull();
  });

  it("both turns completed when both have turn_duration events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeTurnDurationEvent(3000, { timestamp: "2026-01-01T00:00:08Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:05Z" }),
      makeTurnDurationEvent(2000, { timestamp: "2026-01-01T00:01:08Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBe(3000);
    expect(turns[1].status).toBe("completed");
    expect(turns[1].durationMs).toBe(2000);
  });

  it("turn_duration event is included in the turn's events array", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeTurnDurationEvent(5000, { timestamp: "2026-01-01T00:00:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns[0].events).toHaveLength(3);
    expect(turns[0].events[2].type).toBe("system");
  });

  it("completedAt is set when turn is completed via turn_duration", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeTurnDurationEvent(5000, { timestamp: "2026-01-01T00:00:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns[0].completedAt).toBe("2026-01-01T00:00:10Z");
  });
});

describe("groupEventsIntoTurnsIncremental", () => {
  it("falls back to full rebuild when existingTurns is empty", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const turns = groupEventsIntoTurnsIncremental([], events, events.length);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("Turn 1");
  });

  it("incrementally rebuilds only the last turn when new events are appended", () => {
    // Start with turn 1 complete
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeTurnDurationEvent(1000, { timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);

    // Append turn 2 events
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:01Z" }),
    ];

    const newEventCount = 2;
    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, newEventCount);

    expect(turns).toHaveLength(2);
    expect(turns[0].promptText).toBe("Turn 1");
    expect(turns[0].status).toBe("completed");
    expect(turns[1].promptText).toBe("Turn 2");
    expect(turns[1].status).toBe("running");
  });

  it("correctly updates last turn when events are appended within same turn", () => {
    // Turn 1 still running (no turn_duration yet)
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);
    expect(existingTurns[0].status).toBe("running");

    // More events arrive for the same turn (another assistant response + turn_duration)
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:02Z" }),
      makeTurnDurationEvent(2500, { timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBe(2500);
    expect(turns[0].endIndex).toBe(4);
  });

  it("produces identical results to full rebuild", () => {
    // Build a 3-turn session incrementally
    const events1: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeTurnDurationEvent(1000, { timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const turns1 = groupEventsIntoTurns(events1);

    const events2: SessionEvent[] = [
      ...events1,
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:01Z" }),
      makeTurnDurationEvent(500, { timestamp: "2026-01-01T00:01:02Z" }),
    ];
    const turns2 = groupEventsIntoTurnsIncremental(turns1, events2, 3);

    const events3: SessionEvent[] = [
      ...events2,
      makeUserEvent({ text: "Turn 3", timestamp: "2026-01-01T00:02:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:02:01Z" }),
    ];
    const turns3 = groupEventsIntoTurnsIncremental(turns2, events3, 2);

    // Full rebuild should match
    const fullRebuild = groupEventsIntoTurns(events3);
    expect(turns3).toHaveLength(fullRebuild.length);
    for (let i = 0; i < fullRebuild.length; i++) {
      expect(turns3[i].turnNumber).toBe(fullRebuild[i].turnNumber);
      expect(turns3[i].promptText).toBe(fullRebuild[i].promptText);
      expect(turns3[i].status).toBe(fullRebuild[i].status);
      expect(turns3[i].startIndex).toBe(fullRebuild[i].startIndex);
      expect(turns3[i].endIndex).toBe(fullRebuild[i].endIndex);
      expect(turns3[i].cost).toBeCloseTo(fullRebuild[i].cost, 6);
    }
  });
});
