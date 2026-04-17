import { describe, it, expect } from "vitest";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental, getEventsForTurn } from "./turnSnapshot";
import { isAgentCompleted } from "./agentStatus";
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(false);
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true);
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true);
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true);
    expect(turns[0].durationMs).toBeNull();
  });

  it("non-last turn status derives from own events (next turn boundary does NOT retroactively complete)", () => {
    // After the predicate refactor, turn status is derived per-turn from that
    // turn's own events. The "next turn boundary exists → auto-complete" rule
    // was a stored-status heuristic; the predicate reads signals directly.
    // Turn 1: user + assistant (end_turn by default) — completed via Signal 1
    // Turn 2: user + assistant + turn_duration — completed via Signal 2
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:05Z" }),
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({ timestamp: "2026-01-01T00:01:05Z" }),
      makeTurnDurationEvent(4000, { timestamp: "2026-01-01T00:01:10Z" }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(2);
    // Turn 1: default stop_reason is end_turn → completed via predicate
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true);
    expect(turns[0].durationMs).toBeNull();
    // Turn 2 has turn_duration — completed
    expect(isAgentCompleted("main", getEventsForTurn(turns[1], events))).toBe(true);
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true); // completed via stop_reason fallback
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], events))).toBe(true);
    expect(turns[0].durationMs).toBe(3000);
    expect(isAgentCompleted("main", getEventsForTurn(turns[1], events))).toBe(true);
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

  // Test removed: `completedAt` field was deleted from TurnSnapshot in the
  // `isAgentCompleted` predicate refactor (no consumers read it). Completion
  // timing is now derived by consumers: when `isAgentCompleted("main", events)`
  // is true, the last event's timestamp is the completion time.
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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(true);
    expect(turns[1].promptText).toBe("Turn 2");
    // Default stop_reason is "end_turn", so the turn is completed via fallback
    expect(isAgentCompleted("main", getEventsForTurn(turns[1], allEvents))).toBe(true);
  });

  it("correctly updates last turn when events are appended within same turn", () => {
    // Turn 1 still running (tool_use stop_reason, no turn_duration)
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(false);

    // More events arrive for the same turn (another assistant response + turn_duration)
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ timestamp: "2026-01-01T00:00:02Z" }),
      makeTurnDurationEvent(2500, { timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(true);
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
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(false);

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
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(
      isAgentCompleted("main", getEventsForTurn(fullRebuild[0], allEvents)),
    );
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
      expect(isAgentCompleted("main", getEventsForTurn(turns3[i], events3))).toBe(
        isAgentCompleted("main", getEventsForTurn(fullRebuild[i], events3)),
      );
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

describe("groupEventsIntoTurnsIncremental — status derivation across streaming", () => {
  it("reverts completed turn to running when new tool_use events arrive", () => {
    // Turn 1 completed via end_turn stop_reason
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(existingTurns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(true);

    // New events: tool_use arrives, turn should revert to running
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:02Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(false);
  });

  it("stays completed when turn_duration arrives after end_turn", () => {
    // Turn 1 completed via end_turn
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(true);

    // turn_duration confirms completion
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeTurnDurationEvent(1500, { timestamp: "2026-01-01T00:00:02Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);
    expect(turns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(true);
    expect(turns[0].durationMs).toBe(1500);
  });

  it("shows running when new assistant event has no end_turn", () => {
    // Turn 1 completed via end_turn
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "end_turn", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(true);

    // New assistant event without end_turn (tool_use) — status must revert
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeUserEvent({ toolResult: true, userType: "external", timestamp: "2026-01-01T00:00:02Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(false);
  });

  it("turn_duration always wins over stop_reason in new events", () => {
    // Turn running
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:01Z" }),
    ];
    const existingTurns = groupEventsIntoTurns(initialEvents);
    expect(isAgentCompleted("main", getEventsForTurn(existingTurns[0], initialEvents))).toBe(false);

    // New events have both tool_use AND turn_duration — turn_duration wins
    const allEvents: SessionEvent[] = [
      ...initialEvents,
      makeAssistantEvent({ stopReason: "tool_use", timestamp: "2026-01-01T00:00:02Z" }),
      makeTurnDurationEvent(3000, { timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 2);
    expect(turns).toHaveLength(1);
    expect(isAgentCompleted("main", getEventsForTurn(turns[0], allEvents))).toBe(true);
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

// ─── Transitive completion invariant (predicate model) ───────────────
//
// The two original tests in this block ("finalizes main agent when a subagent
// end_turn completes the turn" and "finalizes main when two concurrent
// subagents end_turn in the same delta") described a scenario from the old
// stored-status model where `finalizeTurn` reconciled a turn=completed +
// main=running divergence after a SUBAGENT sent end_turn. Under the predicate
// model (isAgentCompleted), a subagent's end_turn never completes the parent
// turn — only main's own end_turn or a system `turn_duration` event does.
// Those scenarios now evaluate to `isAgentCompleted("main", events) === false`
// (i.e. running), which is the correct verdict and is covered by T-TURNSTATUS-1
// and T-OWN-1. The old tests have been deleted as their premise contradicts
// the new model.

describe("extendTurn transitive completion invariant", () => {
  it("incremental and full-rebuild agree on completion via the predicate", () => {
    // Property-style check: for a realistic mixed stream, incremental and full
    // rebuild must agree on main-agent completion and per-agent completion.
    // This catches any future divergence between extendTurn and buildTurn.
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
      const fullEv = getEventsForTurn(full[i], allEvents);
      const incEv = getEventsForTurn(incremental[i], allEvents);
      // Both paths produce the same verdict for "main" — predicates are pure
      // functions of events, so this is a structural identity check on what
      // the two builders admit into each turn's event range.
      expect(isAgentCompleted("main", incEv)).toBe(isAgentCompleted("main", fullEv));
      expect(incremental[i].agents.length).toBe(full[i].agents.length);
      for (const fullAgent of full[i].agents) {
        const incAgent = incremental[i].agents.find(a => a.agentId === fullAgent.agentId);
        expect(incAgent).toBeDefined();
        // Per-agent completion must match between incremental and full paths.
        expect(isAgentCompleted(fullAgent.agentId, incEv)).toBe(
          isAgentCompleted(fullAgent.agentId, fullEv),
        );
      }
    }
  });

  it("transitive invariant: main completed ⇒ every agent in the turn is completed", () => {
    // SDK contract made testable: when the main agent sends end_turn, every
    // subagent it dispatched has necessarily already returned its output
    // (otherwise main could not respond). The predicate encodes this as a
    // hard per-agent check on the same event range.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do work", timestamp: "2026-01-01T00:00:00Z" }),
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
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    const agentMeta = {
      "sub-1": { agentType: "worker", description: "sub-1 work" },
    };

    const turns = groupEventsIntoTurns(events, agentMeta);
    expect(turns).toHaveLength(1);
    const turnEvents = getEventsForTurn(turns[0], events);

    if (isAgentCompleted("main", turnEvents)) {
      for (const agent of turns[0].agents) {
        expect(isAgentCompleted(agent.agentId, turnEvents)).toBe(true);
      }
    } else {
      throw new Error("expected main to be completed in this fixture");
    }
  });
});

// ─── Per-agent completion via isAgentCompleted predicate ────────────
//
// Under the predicate model, each agent's completion is an independent
// per-agent query against the same event range. There is no aggregate
// "turn status" — consumers derive the display by calling
// `isAgentCompleted(agentId, turnEvents)` per agent they care about.
// These tests originally read as "turn=running while subagent is still
// running" and relied on the old combined status field; they are now
// rewritten to assert the correct per-agent predicate verdicts.

describe("per-agent completion with running subagents", () => {
  it("main end_turn completes main; sub-1 still mid tool_use stays running (buildTurn)", () => {
    // Real scenario: main dispatches sub-1 (tool_use), sub-1 starts working, then
    // main emits end_turn AFTER. Per-agent predicate verdict:
    //   - main: completed (last assistant event is end_turn)
    //   - sub-1: running (last assistant event is tool_use, no parent ack postdates)
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
      // Subagent starts working (still running)
      makeAssistantEvent({
        agentId: "sub-1",
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
        model: "claude-sonnet-4-6",
        isSidechain: true,
      } as Partial<AssistantEvent> & { stopReason: "tool_use" }),
      // Main agent's response comes after (end_turn)
      makeAssistantEvent({
        agentId: "main",
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "end_turn",
        model: "claude-opus-4-6",
      }),
    ];

    const turns = groupEventsIntoTurns(events);
    expect(turns).toHaveLength(1);
    const turnEvents = getEventsForTurn(turns[0], events);
    // Main completed via its own end_turn.
    expect(isAgentCompleted("main", turnEvents)).toBe(true);
    // sub-1 is tracked in the turn's agents map.
    const sub1 = turns[0].agents.find(a => a.agentId === "sub-1");
    expect(sub1).toBeDefined();
    // sub-1 still running — its last stop_reason is tool_use and there's no
    // parent tool_result postdating its last event.
    expect(isAgentCompleted("sub-1", turnEvents)).toBe(false);
  });

  it("marks all agents completed when main and sub-1 each end_turn", () => {
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
        stopReason: "end_turn",
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
    const turnEvents = getEventsForTurn(turns[0], events);
    // Both main and sub-1 are completed per their own end_turn signals.
    expect(isAgentCompleted("main", turnEvents)).toBe(true);
    expect(isAgentCompleted("sub-1", turnEvents)).toBe(true);
    // Transitive invariant: main completed ⇒ all tracked agents completed.
    for (const agent of turns[0].agents) {
      expect(isAgentCompleted(agent.agentId, turnEvents)).toBe(true);
    }
  });

  it("extendTurn: main end_turn completes main; sub-1 tool_use stays running", () => {
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
    const initialEvents = getEventsForTurn(existingTurns[0], initial);
    expect(isAgentCompleted("main", initialEvents)).toBe(false);

    // Now main's end_turn arrives — but sub-1 is still running
    const mainEndEvent = makeAssistantEvent({
      agentId: "main",
      timestamp: "2026-01-01T00:00:02Z",
      stopReason: "end_turn",
      model: "claude-opus-4-6",
    });
    const allEvents: SessionEvent[] = [...initial, mainEndEvent];
    const turns = groupEventsIntoTurnsIncremental(existingTurns, allEvents, 1);

    expect(turns).toHaveLength(1);
    const turnEvents = getEventsForTurn(turns[0], allEvents);
    // Main is completed because its own end_turn arrived.
    expect(isAgentCompleted("main", turnEvents)).toBe(true);
    // sub-1 tracked, still running (tool_use, no postdating parent ack).
    const sub1 = turns[0].agents.find(a => a.agentId === "sub-1");
    expect(sub1).toBeDefined();
    expect(isAgentCompleted("sub-1", turnEvents)).toBe(false);
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

// ─── Turn status ignores subagent end_turn ──────────────────────────
//
// A subagent's stop_reason === "end_turn" must NEVER flip the parent turn
// to "completed". Only main agent end_turn (or a turn_duration system event)
// may complete a turn. Without this guard the last-assistant backward scan
// picks up any sidechain end_turn and prematurely reports the turn done.
//
// NOTE: `makeAssistantEvent` does not spread the `isSidechain` override onto
// the returned event (the helper was built for tests that filter by agentId
// alone). These tests exercise the sidechain guard, so `isSidechain` must be
// attached explicitly via `markSidechain` below.

function markSidechain(event: AssistantEvent): AssistantEvent {
  return { ...event, isSidechain: true };
}

describe("Turn status ignores subagent end_turn", () => {
  it("T-TURNSTATUS-1: subagent end_turn doesn't complete parent turn (buildTurn path)", () => {
    // Main is still running (mid tool_use dispatching a subagent). The LAST
    // assistant event in the merged main+sidechain stream is the subagent's
    // end_turn. The reducer must NOT complete the parent turn.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
    ];
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do the thing" },
    };

    const turns = groupEventsIntoTurns(events, subagentMeta);
    expect(turns).toHaveLength(1);
    // Predicate: main has no end_turn and no turn_duration, so NOT completed.
    const turnEvents = getEventsForTurn(turns[0], events);
    expect(isAgentCompleted("main", turnEvents)).toBe(false);
  });

  it("T-TURNSTATUS-2: main end_turn still completes the turn (happy path)", () => {
    // Regression guard: after the fix, a main end_turn that lands AFTER a
    // subagent end_turn must still complete the turn.
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do the thing" },
    };

    const turns = groupEventsIntoTurns(events, subagentMeta);
    expect(turns).toHaveLength(1);
    // Predicate: main's last assistant event is end_turn → completed.
    const turnEvents = getEventsForTurn(turns[0], events);
    expect(isAgentCompleted("main", turnEvents)).toBe(true);
  });

  it("T-TURNSTATUS-3: extendTurn streaming path ignores subagent end_turn", () => {
    // Initial state: main mid tool_use (dispatching subA). Turn is running.
    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
    ];
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do the thing" },
    };

    const initial = groupEventsIntoTurns(initialEvents, subagentMeta);
    expect(initial).toHaveLength(1);
    const initialTurnEvents = getEventsForTurn(initial[0], initialEvents);
    expect(isAgentCompleted("main", initialTurnEvents)).toBe(false);

    // Delta: ONLY a subagent end_turn event arrives via streaming.
    const delta: SessionEvent[] = [
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
    ];
    const allEvents = [...initialEvents, ...delta];

    const result = groupEventsIntoTurnsIncremental(
      initial,
      allEvents,
      delta.length,
      subagentMeta,
    );

    // Predicate: main still has no end_turn, so still running. The new
    // subagent end_turn does not complete the parent turn.
    expect(result).toHaveLength(1);
    const lastTurn = result[result.length - 1];
    const lastTurnEvents = getEventsForTurn(lastTurn, allEvents);
    expect(isAgentCompleted("main", lastTurnEvents)).toBe(false);
  });

  it("T-TURNSTATUS-4: cross-turn bleed — late subagent end_turn doesn't flip later turn", () => {
    // Two-turn stream. Turn 1 dispatches subA and completes normally. Turn 2
    // is a fresh main-only prompt still running. A late sidechain event tagged
    // as subA lands inside turn 2's window (buffered from turn 1). The late
    // event must NOT flip turn 2 to completed.
    //
    // Note: the existing `computeDispatchedAgentIds` filter already excludes
    // subA from turn 2's dispatched set, so turn 2 may pass even before the
    // fix. The `!isSidechain` guard is still the cleaner fix because it
    // protects against ANY sidechain event, not just cross-turn bleed.
    const events: SessionEvent[] = [
      // Turn 1
      makeUserEvent({ text: "Turn 1", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do X"],
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "tool_use",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:03Z",
        }),
      ),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:04Z",
      }),

      // Turn 2: main-only, still working
      makeUserEvent({ text: "Turn 2", timestamp: "2026-01-01T00:01:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:01:01Z",
      }),

      // Late subagent event bleeding into turn 2's window.
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:01:02Z",
        }),
      ),
    ];
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do X" },
    };

    const turns = groupEventsIntoTurns(events, subagentMeta);
    expect(turns).toHaveLength(2);
    // Predicate: turn 2's main has only a tool_use, so not completed. The
    // late sidechain subA event is filtered out of turn 2's dispatched set
    // (subA was not dispatched in turn 2), and even if it weren't, the
    // predicate only consults main's own events for the turn_duration /
    // end_turn signals.
    const turn2Events = getEventsForTurn(turns[1], events);
    expect(isAgentCompleted("main", turn2Events)).toBe(false);
  });
});

// ─── Ownership invariants ────────────────────────────────────────────
//
// These property-style tests express the invariant enforced by routing
// `turnSnapshot.ts` reducers through `mainEventsOnly(events)` (TASK-002).
// Any future reducer added to turnSnapshot that walks `events` for a
// turn-level fact MUST filter to main events only — a subagent's
// stop_reason does not vote on the parent turn. These tests would fail if
// that routing regresses (e.g. someone reintroduces an inline guard that
// only partially filters, or drops the filter entirely from a reducer).

describe("Ownership invariants", () => {
  it("T-OWN-1: turn status reacts only to main events, regardless of sidechain ordering", () => {
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do the thing" },
    };

    // (a) and (b): defensive coverage — main end_turn must complete the turn
    // regardless of sidechain ordering. Permutation (c) below is the discriminating
    // test that catches reverted sidechain filtering.

    // (a) main end_turn BEFORE sidechain end_turn — turn should be completed.
    //     Main is authoritative; the trailing sidechain event must not undo it.
    const eventsA: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:03Z",
        }),
      ),
    ];

    // (b) sidechain end_turn BEFORE main end_turn — turn should be completed.
    //     Main end_turn is still authoritative regardless of order.
    const eventsB: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];

    // (c) main tool_use (no end_turn) + sidechain end_turn — turn must still be
    //     running. A subagent's end_turn NEVER completes the parent turn.
    const eventsC: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
    ];

    const turnsA = groupEventsIntoTurns(eventsA, subagentMeta);
    const turnsB = groupEventsIntoTurns(eventsB, subagentMeta);
    const turnsC = groupEventsIntoTurns(eventsC, subagentMeta);

    expect(turnsA).toHaveLength(1);
    expect(turnsB).toHaveLength(1);
    expect(turnsC).toHaveLength(1);

    // Predicate: (a) main has end_turn → completed; a trailing sidechain event
    // does not undo that verdict.
    const eventsInA = getEventsForTurn(turnsA[0], eventsA);
    expect(isAgentCompleted("main", eventsInA)).toBe(true);

    // (b) same — main's end_turn is authoritative regardless of sidechain order.
    const eventsInB = getEventsForTurn(turnsB[0], eventsB);
    expect(isAgentCompleted("main", eventsInB)).toBe(true);

    // (c) main has no end_turn (only tool_use), no turn_duration → not
    // completed. A subagent's end_turn NEVER completes the parent turn.
    const eventsInC = getEventsForTurn(turnsC[0], eventsC);
    expect(isAgentCompleted("main", eventsInC)).toBe(false);
  });

  it("T-OWN-2: extendTurn ownership invariant matches groupEventsIntoTurns (streaming split)", () => {
    // Fixture (c) from T-OWN-1: main tool_use + trailing sidechain end_turn.
    // Verdict must be "running" whether built in one shot or split across
    // rebuild + streaming extension.
    const subagentMeta = {
      subA: { agentType: "bug-fixer", description: "Do the thing" },
    };

    const initialEvents: SessionEvent[] = [
      makeUserEvent({ text: "Do the thing", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        agentId: "main",
        stopReason: "tool_use",
        timestamp: "2026-01-01T00:00:01Z",
        taskDispatches: ["Do the thing"],
      }),
    ];

    const delta: SessionEvent[] = [
      markSidechain(
        makeAssistantEvent({
          agentId: "subA",
          stopReason: "end_turn",
          timestamp: "2026-01-01T00:00:02Z",
        }),
      ),
    ];

    const all = [...initialEvents, ...delta];
    const initial = groupEventsIntoTurns(initialEvents, subagentMeta);
    const streamed = groupEventsIntoTurnsIncremental(
      initial,
      all,
      delta.length,
      subagentMeta,
    );

    // Full-rebuild reference: groupEventsIntoTurns(all events at once).
    const full = groupEventsIntoTurns(all, subagentMeta);

    expect(streamed).toHaveLength(1);
    expect(full).toHaveLength(1);
    // Streaming path must produce the same verdict as full rebuild.
    const streamedEvents = getEventsForTurn(streamed[0], all);
    const fullEvents = getEventsForTurn(full[0], all);
    expect(isAgentCompleted("main", streamedEvents)).toBe(false);
    expect(isAgentCompleted("main", fullEvents)).toBe(false);
    expect(isAgentCompleted("main", streamedEvents)).toBe(
      isAgentCompleted("main", fullEvents),
    );
  });
});
