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
    /**
     * If provided, the message content is a list of Task tool_use items with these
     * descriptions. Used to wire up dispatch-membership tests: the dispatched
     * agentId is resolved via subagentMeta description match OR via temporal
     * proximity to the sidechain events' timestamps.
     */
    taskDispatches?: string[];
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
  let content = overrides.message?.content;
  if (!content) {
    if (overrides.taskDispatches && overrides.taskDispatches.length > 0) {
      content = overrides.taskDispatches.map((description, i) => ({
        type: "tool_use" as const,
        id: `toolu-${Math.random().toString(36).slice(2, 8)}-${i}`,
        name: "Task",
        input: { description },
      }));
    } else {
      content = [{ type: "text" as const, text: "response" }];
    }
  }
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
      content,
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
    // TASK-002: main must dispatch the subagent via a Task tool_use so the
    // dispatch-membership filter admits "agent-explore-1" into turn.agents.
    // Temporal proximity (subagent event within 5s of main's tool_use) resolves
    // the mapping because no agentMeta is provided.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["explore the repo"],
      }),
      makeAssistantEvent({
        agentId: "agent-explore-1",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent>),
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
    // TASK-002: main dispatches both subagents via Task tool_uses. Descriptions
    // match agentMeta entries so the dispatch-membership filter resolves by
    // description to admit both subagent agentIds into turn.agents.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["explores code", "plans work"],
      }),
      makeAssistantEvent({
        agentId: "agent-explore-abc",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent>),
      makeAssistantEvent({
        agentId: "agent-plan-def",
        timestamp: "2026-01-01T00:00:03Z",
        isSidechain: true,
      } as Partial<AssistantEvent>),
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
    // TASK-002: without agentMeta, the temporal-proximity fallback maps the
    // subagent's sidechain event (< 5s after main's tool_use) into turn.agents.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:00Z",
        taskDispatches: ["do the thing"],
      }),
      makeAssistantEvent({
        agentId: "agent-unknown-xyz",
        timestamp: "2026-01-01T00:00:01Z",
        isSidechain: true,
      } as Partial<AssistantEvent>),
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

// ─── Bug: turn "completed" while agent still "running" (extendTurn) ──

describe("extendTurn finalizes agent statuses when turn completes", () => {
  it("finalizes main agent (tool_use) when a subagent end_turn completes the turn", () => {
    // Scenario that produces turn=completed + main=running divergence:
    //   existing: main emitted tool_use (running)
    //   delta: a subagent sends end_turn
    // Full rebuild: turn completes via sub-1 end_turn; adjustStatusForSubagents
    //   does not revert (sub-1 is completed); finalizeTurn flips main to completed.
    // Incremental (pre-fix): extendTurn never calls finalizeTurn. Main's lastEvent
    //   is still tool_use (no main events in delta) so main.status stays "running",
    //   while turn.status === "completed". Bug visible.
    //
    // TASK-002: main dispatches sub-1 via Task tool_use; sub-1 is a sidechain
    // event and matched via temporal proximity to main's dispatch timestamp.
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["do sub-1 work"],
      }),
    ];
    const existing = groupEventsIntoTurns(initial);
    expect(existing).toHaveLength(1);
    expect(existing[0].status).toBe("running");
    const mainBefore = existing[0].agents.find(a => a.agentId === "main");
    expect(mainBefore?.status).toBe("running");

    const allEvents: SessionEvent[] = [
      ...initial,
      makeAssistantEvent({
        agentId: "sub-1",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];
    const turns = groupEventsIntoTurnsIncremental(existing, allEvents, 1);

    expect(turns).toHaveLength(1);
    // Turn is completed because sub-1 sent end_turn (last assistant event).
    expect(turns[0].status).toBe("completed");
    // Invariant: when turn is completed, NO agent may be running.
    for (const agent of turns[0].agents) {
      expect(agent.status).not.toBe("running");
    }
    // completedAt must be populated on a completed turn.
    expect(turns[0].completedAt).toBeTruthy();
  });

  it("finalizes main when two concurrent subagents end_turn in the same delta", () => {
    // Multi-subagent reproduction: main is mid-tool_use, two subagents are each
    // mid-tool_use. In a single delta both subs send end_turn concurrently, which
    // completes the turn (last assistant is a sub end_turn, and adjustStatusForSubagents
    // doesn't demote because no non-main agent is still running). finalizeTurn
    // must then flip main from "running" to "completed" so the streaming path
    // produces the same hierarchy as the full rebuild.
    //
    // Distinct from Test A (single sub end_turn) because it pins the MULTI-sub
    // delta case: both subs going terminal in the same incremental extension is
    // the realistic "parallel subagents finishing together" pattern.
    //
    // Without finalizeTurn in extendTurn, main stays "running" while the turn
    // is "completed" — the user-visible hierarchy divergence bug.
    // TASK-002: main dispatches both sub-1 and sub-2 via Task tool_uses. Each
    // subagent's sidechain events fall within 5s of main's dispatch timestamp,
    // so the temporal-proximity fallback admits them into turn.agents.
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["sub-1 work", "sub-2 work"],
      }),
      makeAssistantEvent({
        agentId: "sub-1",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
      makeAssistantEvent({
        agentId: "sub-2",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:03Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
    ];
    const existing = groupEventsIntoTurns(initial);
    expect(existing).toHaveLength(1);
    expect(existing[0].status).toBe("running");

    const allEvents: SessionEvent[] = [
      ...initial,
      makeAssistantEvent({
        agentId: "sub-1",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:04Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "sub-2",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:05Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];
    const turns = groupEventsIntoTurnsIncremental(existing, allEvents, 2);

    expect(turns).toHaveLength(1);
    // Turn completes: last assistant is sub-2 end_turn and no non-main agent is still running.
    expect(turns[0].status).toBe("completed");
    // Invariant: when turn is completed, NO agent may be running — specifically,
    // main must have been flipped by finalizeTurn even though the delta contained
    // no main events.
    const main = turns[0].agents.find(a => a.agentId === "main");
    const sub1 = turns[0].agents.find(a => a.agentId === "sub-1");
    const sub2 = turns[0].agents.find(a => a.agentId === "sub-2");
    expect(main?.status).toBe("completed");
    expect(sub1?.status).toBe("completed");
    expect(sub2?.status).toBe("completed");
  });

  it("extendTurn output matches groupEventsIntoTurns for the same stream (invariant)", () => {
    // Property-style check: for a realistic mixed stream, incremental and full
    // rebuild must agree on turn.status and every agent's status. This catches
    // any future divergence between extendTurn and buildTurn.
    //
    // TASK-002: main must dispatch sub-1 so the dispatch-membership filter
    // admits sub-1 into turn.agents. P2-1: agentMeta is provided so
    // description-match binds the dispatch in the INITIAL snapshot (before
    // sub-1's event arrives) — this is the production path whenever
    // subagentMeta is populated by the server (the normal case).
    const allEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["sub-1 work"],
      }),
      makeAssistantEvent({
        agentId: "sub-1",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];
    const agentMeta = {
      "sub-1": { agentType: "worker", description: "sub-1 work" },
    };

    const full = groupEventsIntoTurns(allEvents, agentMeta);

    // Split midstream and run incrementally over the remainder.
    const splitPoint = 2;
    const existing = groupEventsIntoTurns(allEvents.slice(0, splitPoint), agentMeta);
    const incremental = groupEventsIntoTurnsIncremental(
      existing,
      allEvents,
      allEvents.length - splitPoint,
      agentMeta
    );

    expect(incremental.length).toBe(full.length);
    for (let i = 0; i < full.length; i++) {
      expect(incremental[i].status).toBe(full[i].status);
      expect(incremental[i].agents.length).toBe(full[i].agents.length);
      for (const fullAgent of full[i].agents) {
        const incAgent = incremental[i].agents.find(a => a.agentId === fullAgent.agentId);
        expect(incAgent).toBeDefined();
        expect(incAgent!.status).toBe(fullAgent.status);
      }
    }
  });
});

// ─── Bug 2: Turn shows "completed" while subagents still running ────

describe("Bug 2: turn status with running subagents", () => {
  it("marks turn as running when subagent is dispatched and main end_turn is last event (buildTurn)", () => {
    // Real scenario: main dispatches sub-1 (tool_use), sub-1 starts working, then
    // main emits a second end_turn AFTER. The last assistant event is main's
    // end_turn, so old code said "completed". But sub-1 is still running (its
    // last stop_reason was tool_use).
    //
    // TASK-002: the initial main tool_use carries a Task dispatch; sub-1's
    // sidechain event follows within 5s so temporal proximity admits it.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do something complex", timestamp: "2026-01-01T00:00:00Z" }),
      // Main dispatches sub-1
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:00Z",
        stopReason: "tool_use",
        model: "claude-opus-4-6",
        taskDispatches: ["sub-1 work"],
      }),
      // Subagent starts working
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use", // Still running
        model: "claude-sonnet-4-6",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
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
    // TASK-002: the preceding main event dispatches sub-1 via Task; sub-1's
    // sidechain event follows within 5s so temporal proximity admits it.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do something", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
        model: "claude-opus-4-6",
        taskDispatches: ["sub-1 work"],
      }),
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "end_turn", // Subagent also finished
        model: "claude-sonnet-4-6",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:03Z",
        stopReason: "end_turn",
        model: "claude-opus-4-6",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    // Both main and sub-1 finished: turn is completed
    expect(turns[0].status).toBe("completed");
  });

  it("marks turn as running via extendTurn when main sent end_turn and subagent still running (extendTurn)", () => {
    // TASK-002: main dispatches sub-1 via Task before sub-1's sidechain events
    // appear; temporal proximity binds sub-1 to the dispatch.
    // Initial: main dispatches sub-1 (tool_use), sub-1 running, main has NOT
    // yet sent final end_turn.
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "hello", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:00Z",
        stopReason: "tool_use",
        model: "claude-opus-4-6",
        taskDispatches: ["sub-1 work"],
      }),
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use", // Still running
        model: "claude-sonnet-4-6",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
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

// ─── TASK-002: Turn membership by dispatch ──────────────────────────

describe("Turn membership by dispatch", () => {
  it("T-DISPATCH-1: subagent events from a prior turn do not leak into current turn", () => {
    // Three-turn stream. Turn 1 dispatches subA via a main Task tool_use and the
    // subagent's sidechain events occur inside turn 1. Turn 2 is main-only. Turn 3
    // is main-only but has a rogue sidechain event tagged with subA's agentId whose
    // timestamp falls inside turn 3's window. Expected: turn 1 contains subA; turns
    // 2 and 3 contain only "main" (subA was NOT dispatched in either).
    const events: SessionEvent[] = [
      // Turn 1: user, main dispatches subA, sidechain event from subA
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do X"],
      }),
      makeAssistantEvent({
        agentId: "subA",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
      }),

      // Turn 2: user, main-only (no Task dispatches)
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:01:01Z",
      }),

      // Turn 3: user, main-only + rogue subA sidechain event (simulates late event)
      makeUserEvent({ text: "Turn 3", timestamp: "2026-01-01T00:02:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:02:01Z",
      }),
      makeAssistantEvent({
        agentId: "subA",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:02:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:02:03Z",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(3);

    const turn1AgentIds = turns[0].agents.map(a => a.agentId).sort();
    expect(turn1AgentIds).toEqual(["main", "subA"]);

    const turn2AgentIds = turns[1].agents.map(a => a.agentId);
    expect(turn2AgentIds).toEqual(["main"]);

    const turn3AgentIds = turns[2].agents.map(a => a.agentId);
    expect(turn3AgentIds).toEqual(["main"]);
  });

  it("T-DISPATCH-2: turn with no Task dispatch has only main", () => {
    // Single turn with a rogue sidechain event (agentId "subX") whose timestamp
    // falls inside the turn. No Task dispatch, so subX must be filtered out.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeAssistantEvent({
        agentId: "subX",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    const ids = turns[0].agents.map(a => a.agentId);
    expect(ids).toEqual(["main"]);
  });

  it("T-DISPATCH-3: description match adds dispatched agentId", () => {
    // Main tool_use description "Fix the foo bug" matches subagentMeta entry for
    // "agent-abc123". Sidechain events with that agentId must end up in agents list.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Fix the foo bug"],
      }),
      makeAssistantEvent({
        agentId: "agent-abc123",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    const agentMeta = {
      "agent-abc123": { agentType: "bug-fixer", description: "Fix the foo bug" },
    };

    const turns = groupEventsIntoTurns(events, agentMeta);
    expect(turns).toHaveLength(1);
    const ids = turns[0].agents.map(a => a.agentId).sort();
    expect(ids).toEqual(["agent-abc123", "main"]);
    const bugFixer = turns[0].agents.find(a => a.agentId === "agent-abc123");
    expect(bugFixer?.agentType).toBe("bug-fixer");
  });

  it("T-DISPATCH-4: temporal proximity fallback when description mismatches", () => {
    // Main tool_use at T with description "unknown"; subagentMeta has no entry
    // matching "unknown". A sidechain event with agentId "agent-xyz" at T+2s must
    // be matched via the temporal-proximity fallback.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:10Z",
        taskDispatches: ["unknown"],
      }),
      makeAssistantEvent({
        agentId: "agent-xyz",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:12Z", // T + 2s — within 5s window
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:13Z",
      }),
    ];
    // agentMeta does NOT contain an entry whose description === "unknown"
    const agentMeta = {
      "agent-other": { agentType: "other", description: "not a match" },
    };

    const turns = groupEventsIntoTurns(events, agentMeta);
    expect(turns).toHaveLength(1);
    const ids = turns[0].agents.map(a => a.agentId).sort();
    expect(ids).toEqual(["agent-xyz", "main"]);
  });

  // T-DISPATCH-5 / T-DISPATCH-6 — P2-1: extendTurn must scan only the delta,
  // not the full turn event slice, per Architecture Invariant #8 (O(1) per
  // live event). The previous design re-scanned `allTurnEvents` on every
  // streaming batch; the fix inherits the dispatched set from the prior
  // snapshot and only scans `newEvents` for additional dispatches.

  it("T-DISPATCH-5: extendTurn inherits dispatched set from prior state", () => {
    // Existing turn dispatched sub-A via main's Task tool_use. A subsequent
    // delta brings ONLY sub-A's sidechain events — no new Task dispatch in
    // the delta. The inherited dispatched set must keep sub-A admitted into
    // turn.agents; a full-rebuild on the same stream must agree.
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["do sub-A work"],
      }),
      makeAssistantEvent({
        agentId: "sub-A",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:02Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
    ];
    const existing = groupEventsIntoTurns(initial);
    expect(existing).toHaveLength(1);
    expect(existing[0].agents.map(a => a.agentId).sort()).toEqual(["main", "sub-A"]);

    // Delta: more sub-A sidechain events, NO new Task dispatch.
    const allEvents: SessionEvent[] = [
      ...initial,
      makeAssistantEvent({
        agentId: "sub-A",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:03Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
      makeAssistantEvent({
        agentId: "sub-A",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:04Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];

    const incremental = groupEventsIntoTurnsIncremental(existing, allEvents, 2);
    const full = groupEventsIntoTurns(allEvents);

    // Inheritance worked: sub-A is still in agents.
    const incIds = incremental[0].agents.map(a => a.agentId).sort();
    expect(incIds).toEqual(["main", "sub-A"]);
    // Incremental output matches full rebuild (no divergence).
    expect(incIds).toEqual(full[0].agents.map(a => a.agentId).sort());
  });

  it("T-DISPATCH-6: extendTurn picks up a new Task dispatch in the delta", () => {
    // Existing turn has no dispatches (main-only). The delta contains a new
    // main assistant with a Task tool_use matching subagentMeta, plus that
    // subagent's first sidechain event. extendTurn must scan the delta and
    // admit the new subagent.
    const initial: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const agentMeta = {
      "agent-new-1": { agentType: "Fixer", description: "fix the bug" },
    };
    const existing = groupEventsIntoTurns(initial, agentMeta);
    expect(existing).toHaveLength(1);
    expect(existing[0].agents.map(a => a.agentId)).toEqual(["main"]);

    // Delta: main emits a Task dispatch; the subagent's first event follows.
    const allEvents: SessionEvent[] = [
      ...initial,
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:02Z",
        taskDispatches: ["fix the bug"],
      }),
      makeAssistantEvent({
        agentId: "agent-new-1",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "end_turn" }),
    ];

    const incremental = groupEventsIntoTurnsIncremental(existing, allEvents, 2, agentMeta);
    const full = groupEventsIntoTurns(allEvents, agentMeta);

    const incIds = incremental[0].agents.map(a => a.agentId).sort();
    expect(incIds).toEqual(["agent-new-1", "main"]);
    // Incremental output matches full rebuild.
    expect(incIds).toEqual(full[0].agents.map(a => a.agentId).sort());
  });
});
