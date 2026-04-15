import { describe, it, expect } from "vitest";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental, getEventsForTurn } from "./turnSnapshot";
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
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    stopReason?: "end_turn" | "tool_use" | null;
    model?: string;
  } = {}
): AssistantEvent {
  const usage = {
    input_tokens: overrides.inputTokens ?? 100,
    output_tokens: overrides.outputTokens ?? 50,
    ...(overrides.cacheWriteTokens !== undefined && {
      cache_creation_input_tokens: overrides.cacheWriteTokens,
    }),
    ...(overrides.cacheReadTokens !== undefined && {
      cache_read_input_tokens: overrides.cacheReadTokens,
    }),
  };
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
      model: overrides.model ?? "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: overrides.stopReason ?? "end_turn",
      usage,
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
    expect(getEventsForTurn(turns[0], events)).toHaveLength(1);
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
    expect(getEventsForTurn(turns[0], events)).toHaveLength(2);
    expect(turns[1].turnNumber).toBe(2);
    expect(turns[1].promptText).toBe("Turn 2 prompt");
    expect(getEventsForTurn(turns[1], events)).toHaveLength(2);
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
    expect(getEventsForTurn(turns[0], events)).toHaveLength(4);
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
    expect(getEventsForTurn(turns[0], events)).toHaveLength(4);
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

  it("stop_reason end_turn completes a turn even without turn_duration (SDK sessions)", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBeNull(); // no turn_duration event, so no duration
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
    expect(getEventsForTurn(turns[0], events)).toHaveLength(2);
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

describe("groupEventsIntoTurns — cache token cost calculation", () => {
  it("includes cache write and cache read tokens in turn cost", () => {
    // sonnet pricing: input $3/M, output $15/M, cacheWrite $3.75/M, cacheRead $0.3/M
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 2000,
        cacheReadTokens: 3000,
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);

    // Expected: (1000*3 + 500*15 + 2000*3.75 + 3000*0.3) / 1_000_000
    //         = (3000 + 7500 + 7500 + 900) / 1_000_000 = 0.018900
    expect(turns[0].cost).toBeCloseTo(0.0189, 6);
    expect(turns[0].costBreakdown.total).toBeCloseTo(0.0189, 6);

    // Input cost should include cache write and cache read (both are input-side costs)
    // (1000*3 + 2000*3.75 + 3000*0.3) / 1_000_000 = (3000+7500+900)/1M = 0.0114
    expect(turns[0].costBreakdown.inputCost).toBeCloseTo(0.0114, 6);

    // Output cost: (500*15) / 1_000_000 = 0.0075
    expect(turns[0].costBreakdown.outputCost).toBeCloseTo(0.0075, 6);
  });

  it("defaults cache tokens to zero when not present in usage", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        inputTokens: 1000,
        outputTokens: 500,
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    // No cache tokens: (1000*3 + 500*15) / 1_000_000 = 0.0105
    expect(turns[0].cost).toBeCloseTo(0.0105, 6);
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

  it("turn without turn_duration but with end_turn stop_reason is completed (SDK fallback)", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    // Default stop_reason in makeAssistantEvent is "end_turn", so this completes
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBeNull();
  });

  it("non-last turn is auto-completed (next turn boundary proves it ended)", () => {
    // Turn 1: user + assistant (no turn_duration)
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
    // Turn 1: no turn_duration, but auto-completed because turn 2 exists
    expect(turns[0].status).toBe("completed");
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

  it("system events with other subtypes do not trigger turn_duration completion", () => {
    // The assistant has stop_reason "end_turn" (default), so the turn IS completed
    // via the stop_reason fallback — but durationMs stays null (no turn_duration event)
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeSystemEvent("init", { timestamp: "2026-01-01T00:00:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("completed"); // completed via stop_reason fallback
    expect(turns[0].durationMs).toBeNull(); // no turn_duration, so no duration
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
    const turnEvents = getEventsForTurn(turns[0], events);
    expect(turnEvents).toHaveLength(3);
    expect(turnEvents[2].type).toBe("system");
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
    // Default stop_reason is "end_turn", so the turn is completed via fallback
    expect(turns[1].status).toBe("completed");
  });

  it("correctly updates last turn when events are appended within same turn", () => {
    // Turn 1 still running (tool_use stop_reason, no turn_duration)
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:01Z" }),
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

  it("fast path: no turn boundary in new events rebuilds only last turn", () => {
    // Turn 1 is running (tool_use, no turn_duration) with many events
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({ toolResult: true, userType: "external", timestamp: "2026-01-01T00:00:02Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:03Z" }),
      makeUserEvent({ toolResult: true, userType: "external", timestamp: "2026-01-01T00:00:04Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);
    expect(existingTurns[0].status).toBe("running");

    // New events: more assistant/tool responses, NO turn boundary
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:05Z" }),
      makeUserEvent({ toolResult: true, userType: "external", timestamp: "2026-01-01T00:00:06Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:07Z" }), // end_turn
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 3);
    const fullRebuild = groupEventsIntoTurns(allEvents);

    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe(fullRebuild[0].promptText);
    expect(turns[0].startIndex).toBe(fullRebuild[0].startIndex);
    expect(turns[0].endIndex).toBe(fullRebuild[0].endIndex);
    expect(turns[0].status).toBe(fullRebuild[0].status);
    expect(turns[0].cost).toBeCloseTo(fullRebuild[0].cost, 6);
  });

  it("slow path: turn boundary in new events creates new turns", () => {
    // Turn 1 complete
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeTurnDurationEvent(1000, { timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);

    // New events include a turn boundary (external user with text)
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:01Z" }),
      makeUserEvent({ text: "Turn 3", timestamp: "2026-01-01T00:02:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:02:01Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 4);
    const fullRebuild = groupEventsIntoTurns(allEvents);

    expect(turns).toHaveLength(fullRebuild.length);
    for (let i = 0; i < fullRebuild.length; i++) {
      expect(turns[i].turnNumber).toBe(fullRebuild[i].turnNumber);
      expect(turns[i].promptText).toBe(fullRebuild[i].promptText);
      expect(turns[i].startIndex).toBe(fullRebuild[i].startIndex);
      expect(turns[i].endIndex).toBe(fullRebuild[i].endIndex);
      expect(turns[i].cost).toBeCloseTo(fullRebuild[i].cost, 6);
    }
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

// ─── System-injected content filtering ──────────────────────────────

describe("groupEventsIntoTurns — system-injected content filtering", () => {
  it("does NOT create turns from <task-notification> events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({
        text: "<task-notification>\n<task-id>abc123</task-id>\n</task-notification>",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:03Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("do the thing");
    // Task notification event should be part of turn 1, not a separate turn
    expect(getEventsForTurn(turns[0], events)).toHaveLength(4);
  });

  it("does NOT create turns from [Request interrupted by user] events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "do something", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({
        text: "[Request interrupted by user]",
        timestamp: "2026-01-01T00:00:02Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
  });

  it("does NOT create turns from isMeta events (skill expansions)", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: '<command-message>mas:dev-loop</command-message>\n<command-name>/mas:dev-loop</command-name>\n<command-args>build it</command-args>',
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeUserEvent({
        text: "# Development Loop (MAS)\n\nExecute the full mandatory workflow for: build it\n...",
        timestamp: "2026-01-01T00:00:01Z",
        isMeta: true,
      } as Partial<UserEvent> & { text: string }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("/mas:dev-loop build it");
  });

  it("does NOT create turns from <local-command-caveat> events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "continue", timestamp: "2026-01-01T00:00:00Z" }),
      makeUserEvent({
        text: "<local-command-caveat>Caveat: messages below were generated...</local-command-caveat>",
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeUserEvent({
        text: "<local-command-stdout>Login successful</local-command-stdout>",
        timestamp: "2026-01-01T00:00:02Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("continue");
  });

  it("does NOT create turns from <command-name> without <command-message>", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "hello", timestamp: "2026-01-01T00:00:00Z" }),
      makeUserEvent({
        text: '<command-name>/login</command-name>\n<command-message>login</command-message>',
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    // This one starts with <command-name> but also has <command-message>, so it's NOT filtered
    // because command-message indicates user action
    const turns = groupEventsIntoTurns(events);
    // Actually, it starts with <command-name>, not <command-message>. The filter checks:
    // starts with <command-name> AND does NOT include <command-message> → filter.
    // But this one DOES include <command-message>, so it should NOT be filtered.
    // However, looking at the data, the /login event has <command-name> first then <command-message>,
    // which means it passes the "includes <command-message>" check and is NOT filtered.
    expect(turns).toHaveLength(2);
  });

  it("does NOT create turns from 'Base directory for this skill:' events", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "continue", timestamp: "2026-01-01T00:00:00Z" }),
      makeUserEvent({
        text: "Base directory for this skill: /path/to/skill\n\n# Verification...",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
  });

  it("cleans session continuation summaries into readable label", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: "This session is being continued from a previous conversation that ran out of context...",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:01Z" }),
      makeUserEvent({ text: "do something", timestamp: "2026-01-01T00:00:02Z" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    expect(turns[0].promptText).toBe("(continued session)");
    expect(turns[1].promptText).toBe("do something");
  });

  it("cleans slash command XML into readable format", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: '<command-message>mas:dev-loop</command-message>\n<command-name>/mas:dev-loop</command-name>\n<command-args>fix all findings</command-args>',
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("/mas:dev-loop fix all findings");
  });

  it("handles slash command without args", () => {
    const events: SessionEvent[] = [
      makeUserEvent({
        text: '<command-message>commit</command-message>\n<command-name>/commit</command-name>\n<command-args></command-args>',
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].promptText).toBe("/commit");
  });
});

// ─── extendTurn status reversion (TASK-001) ──────────────────────────

describe("groupEventsIntoTurnsIncremental — extendTurn status reversion", () => {
  it("reverts completed turn to running when new tool_use events arrive", () => {
    // Turn 1 completed via end_turn stop_reason
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);
    expect(existingTurns[0].status).toBe("completed");

    // New events: tool_use arrives, turn should revert to running
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:02Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("running");
  });

  it("stays completed when turn_duration arrives after end_turn", () => {
    // Turn 1 completed via end_turn
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns[0].status).toBe("completed");

    // turn_duration confirms completion
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeTurnDurationEvent(1500, { timestamp: "2026-01-01T00:00:02Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBe(1500);
  });

  it("shows running when new assistant event has no end_turn", () => {
    // Turn 1 completed via end_turn
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns[0].status).toBe("completed");

    // New assistant event without end_turn (tool_use) — status must revert
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeUserEvent({ toolResult: true, userType: "external", timestamp: "2026-01-01T00:00:02Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("running");
  });

  it("turn_duration always wins over stop_reason in new events", () => {
    // Turn running
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns[0].status).toBe("running");

    // New events have both tool_use AND turn_duration — turn_duration wins
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:02Z" }),
      makeTurnDurationEvent(3000, { timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("completed");
    expect(turns[0].durationMs).toBe(3000);
  });
});

// ─── Model per turn ──────────────────────────────────────────────────

describe("TurnSnapshot model tracking", () => {
  it("populates model from assistant event", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "hello" }),
      makeAssistantEvent({ model: "claude-opus-4-6", stopReason: "end_turn" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].model).toBe("claude-opus-4-6");
  });

  it("uses the last model seen when multiple assistant events exist", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "hello" }),
      makeAssistantEvent({ model: "claude-sonnet-4-6", stopReason: "tool_use" }),
      makeUserEvent({ toolResult: true }),
      makeAssistantEvent({ model: "claude-opus-4-6", stopReason: "end_turn" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].model).toBe("claude-opus-4-6");
  });

  it("is undefined when no assistant event present", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "hello" }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].model).toBeUndefined();
  });

  it("extendTurn preserves model when new events have no assistant", () => {
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "hello" }),
      makeAssistantEvent({ model: "claude-sonnet-4-6", stopReason: "tool_use" }),
    ];
    const existingTurns = groupEventsIntoTurns(initial);
    expect(existingTurns[0].model).toBe("claude-sonnet-4-6");

    const allEvents: SessionEvent[] = [
      ...initial,
      makeUserEvent({ toolResult: true }),
    ];
    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns[0].model).toBe("claude-sonnet-4-6");
  });

  it("extendTurn updates model when new assistant event arrives", () => {
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "hello" }),
      makeAssistantEvent({ model: "claude-sonnet-4-6", stopReason: "tool_use" }),
      makeUserEvent({ toolResult: true }),
    ];
    const existingTurns = groupEventsIntoTurns(initial);

    const allEvents: SessionEvent[] = [
      ...initial,
      makeAssistantEvent({ model: "claude-opus-4-6", stopReason: "end_turn" }),
    ];
    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns[0].model).toBe("claude-opus-4-6");
  });
});

// ─── Bug 2: Turn shows "completed" while subagents still running ────

describe("Bug 2: turn status with running subagents", () => {
  it("marks turn as running when subagent is dispatched and main end_turn is last event (buildTurn)", () => {
    // Real scenario: subagent starts (tool_use), then main agent's end_turn comes AFTER.
    // The last assistant event is main's end_turn, so old code says "completed".
    // But sub-1 is still running (its last stop_reason was tool_use).
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do something complex", timestamp: "2026-01-01T00:00:00Z" }),
      // Subagent starts working
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use", // Still running
        model: "claude-sonnet-4-6",
      }),
      // Main agent's response comes after (end_turn — dispatching done)
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "end_turn",
        model: "claude-opus-4-6",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    // Turn should be "running" because sub-1 hasn't finished
    expect(turns[0].status).toBe("running");
    // sub-1 should be tracked as a running agent
    const sub1 = turns[0].agents.find(a => a.agentId === "sub-1");
    expect(sub1).toBeDefined();
    expect(sub1!.status).toBe("running");
  });

  it("marks turn as completed when main and all subagents have finished", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do something", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
        model: "claude-opus-4-6",
      }),
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "end_turn", // Subagent also finished
        model: "claude-sonnet-4-6",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    // Both main and sub-1 finished: turn is completed
    expect(turns[0].status).toBe("completed");
  });

  it("marks turn as running via extendTurn when main sent end_turn and subagent still running (extendTurn)", () => {
    // Initial: subagent is running, main has NOT yet sent end_turn
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "hello", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use", // Still running
        model: "claude-sonnet-4-6",
      }),
    ];
    const existingTurns = groupEventsIntoTurns(initial);
    expect(existingTurns[0].status).toBe("running");

    // Now main's end_turn arrives — but sub-1 is still running
    const mainEndEvent = makeAssistantEvent({
      agentId: "main",
      timestamp: "2026-01-01T00:00:02Z",
      stopReason: "end_turn",
      model: "claude-opus-4-6",
    });
    const allEvents: SessionEvent[] = [...initial, mainEndEvent];
    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);

    // Turn should STILL be "running" because sub-1 hasn't finished
    expect(turns[0].status).toBe("running");
    const sub1 = turns[0].agents.find(a => a.agentId === "sub-1");
    expect(sub1).toBeDefined();
    expect(sub1!.status).toBe("running");
  });
});
