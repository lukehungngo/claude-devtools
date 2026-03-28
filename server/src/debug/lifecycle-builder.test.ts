import { describe, it, expect } from "vitest";
import {
  buildLifecycleRecords,
  processNewEvents,
  createInitialState,
} from "./lifecycle-builder.js";
import type { UserEvent, AssistantEvent, SessionEvent } from "../types.js";

// ── Factory helpers ──────────────────────────────────────────────────

function makeUserEvent(overrides?: Partial<UserEvent>): UserEvent {
  return {
    type: "user",
    uuid: "uuid-" + Math.random().toString(36).slice(2),
    timestamp: "2026-03-28T10:00:00Z",
    sessionId: "test-session",
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    },
    ...overrides,
  };
}

function makeAssistantEvent(
  overrides?: Partial<AssistantEvent> & {
    content?: AssistantEvent["message"]["content"];
    usage?: Partial<AssistantEvent["message"]["usage"]>;
    model?: string;
    stop_reason?: AssistantEvent["message"]["stop_reason"];
  }
): AssistantEvent {
  const {
    content,
    usage,
    model,
    stop_reason,
    ...rest
  } = overrides ?? {};
  return {
    type: "assistant",
    uuid: "uuid-" + Math.random().toString(36).slice(2),
    timestamp: "2026-03-28T10:01:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: content ?? [{ type: "text", text: "hi there" }],
      model: model ?? "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: stop_reason ?? "end_turn",
      usage: {
        input_tokens: usage?.input_tokens ?? 100,
        output_tokens: usage?.output_tokens ?? 50,
        cache_creation_input_tokens:
          usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
      },
    },
    ...rest,
  };
}

const emptyMeta = new Map<string, { agentType: string; description: string }>();

// ── Tests ────────────────────────────────────────────────────────────

describe("buildLifecycleRecords", () => {
  it("returns empty records for empty events", () => {
    const result = buildLifecycleRecords("s1", [], emptyMeta);

    expect(result.turns).toEqual([]);
    expect(result.agentLifecycles).toEqual([]);
    expect(result.lifecycleEvents).toEqual([]);
  });

  it("single user + assistant produces 1 turn, 1 agent (main), 2 events", () => {
    const user = makeUserEvent({
      uuid: "u1",
      timestamp: "2026-03-28T10:00:00Z",
    });
    const asst = makeAssistantEvent({
      uuid: "a1",
      timestamp: "2026-03-28T10:01:00Z",
    });

    const result = buildLifecycleRecords("s1", [user, asst], emptyMeta);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].turnNumber).toBe(1);
    expect(result.turns[0].promptText).toBe("hello");
    expect(result.turns[0].startTime).toBe("2026-03-28T10:00:00Z");
    expect(result.turns[0].endTime).toBe("2026-03-28T10:01:00Z");
    expect(result.turns[0].status).toBe("completed");

    expect(result.agentLifecycles).toHaveLength(1);
    expect(result.agentLifecycles[0].agentId).toBe("main");
    expect(result.agentLifecycles[0].agentType).toBe("main");
    expect(result.agentLifecycles[0].parentAgentId).toBeNull();

    expect(result.lifecycleEvents).toHaveLength(2);
  });

  it("two user events produce 2 turns with correct boundaries", () => {
    const u1 = makeUserEvent({
      uuid: "u1",
      timestamp: "2026-03-28T10:00:00Z",
      message: { role: "user", content: [{ type: "text", text: "first" }] },
    });
    const a1 = makeAssistantEvent({
      uuid: "a1",
      timestamp: "2026-03-28T10:01:00Z",
    });
    const u2 = makeUserEvent({
      uuid: "u2",
      timestamp: "2026-03-28T10:02:00Z",
      message: { role: "user", content: [{ type: "text", text: "second" }] },
    });
    const a2 = makeAssistantEvent({
      uuid: "a2",
      timestamp: "2026-03-28T10:03:00Z",
    });

    const result = buildLifecycleRecords("s1", [u1, a1, u2, a2], emptyMeta);

    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].turnNumber).toBe(1);
    expect(result.turns[0].promptText).toBe("first");
    expect(result.turns[0].endTime).toBe("2026-03-28T10:01:00Z");
    expect(result.turns[1].turnNumber).toBe(2);
    expect(result.turns[1].promptText).toBe("second");
    expect(result.turns[1].startTime).toBe("2026-03-28T10:02:00Z");
  });

  it("events with agentId produce separate agent lifecycle records", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({
      timestamp: "2026-03-28T10:01:00Z",
      agentId: "sub-1",
    } as Partial<AssistantEvent> & { agentId: string });
    const meta = new Map([
      ["sub-1", { agentType: "Explore", description: "explore things" }],
    ]);

    const result = buildLifecycleRecords("s1", [u1, a1], meta);

    expect(result.agentLifecycles).toHaveLength(2); // main + sub-1
    const subAgent = result.agentLifecycles.find((a) => a.agentId === "sub-1");
    expect(subAgent).toBeDefined();
    expect(subAgent!.agentType).toBe("Explore");
    expect(subAgent!.parentAgentId).toBe("main");
    expect(subAgent!.description).toBe("explore things");
  });

  it("stop_reason end_turn marks agent as completed", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({
      timestamp: "2026-03-28T10:01:00Z",
      stop_reason: "end_turn",
    });

    const result = buildLifecycleRecords("s1", [u1, a1], emptyMeta);

    const mainAgent = result.agentLifecycles.find((a) => a.agentId === "main");
    expect(mainAgent!.status).toBe("completed");
  });

  it("assistant event with tool_use content extracts toolName", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({
      uuid: "a1",
      timestamp: "2026-03-28T10:01:00Z",
      content: [
        { type: "tool_use", id: "t1", name: "Read", input: {} },
        { type: "text", text: "reading file" },
      ],
    });

    const result = buildLifecycleRecords("s1", [u1, a1], emptyMeta);

    const assistantEvent = result.lifecycleEvents.find(
      (e) => e.eventUuid === "a1"
    );
    expect(assistantEvent!.toolName).toBe("Read");
  });

  it("user event with tool_result + is_error sets toolResultError", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({ timestamp: "2026-03-28T10:01:00Z" });
    const u2 = makeUserEvent({
      uuid: "u2",
      timestamp: "2026-03-28T10:02:00Z",
      userType: "internal",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "Error: file not found",
            is_error: true,
          },
        ],
      },
    });

    const result = buildLifecycleRecords("s1", [u1, a1, u2], emptyMeta);

    const errorEvent = result.lifecycleEvents.find(
      (e) => e.eventUuid === "u2"
    );
    expect(errorEvent!.toolResultError).toBe(true);
  });

  it("sidechain user events do NOT create turn boundaries", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const sidechain = makeUserEvent({
      timestamp: "2026-03-28T10:01:00Z",
      isSidechain: true,
      message: { role: "user", content: [{ type: "text", text: "sidechain prompt" }] },
    });
    const a1 = makeAssistantEvent({ timestamp: "2026-03-28T10:02:00Z" });

    const result = buildLifecycleRecords("s1", [u1, sidechain, a1], emptyMeta);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].turnNumber).toBe(1);
  });

  it("internal user events do NOT create turn boundaries", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const internal = makeUserEvent({
      timestamp: "2026-03-28T10:01:00Z",
      userType: "internal",
      message: { role: "user", content: [{ type: "text", text: "tool result" }] },
    });
    const a1 = makeAssistantEvent({ timestamp: "2026-03-28T10:02:00Z" });

    const result = buildLifecycleRecords("s1", [u1, internal, a1], emptyMeta);

    expect(result.turns).toHaveLength(1);
  });

  it("events before first turn boundary get turnNumber 0", () => {
    const a1 = makeAssistantEvent({
      uuid: "a0",
      timestamp: "2026-03-28T09:59:00Z",
    });
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a2 = makeAssistantEvent({
      uuid: "a1",
      timestamp: "2026-03-28T10:01:00Z",
    });

    const result = buildLifecycleRecords("s1", [a1, u1, a2], emptyMeta);

    // Pre-turn events become turn 0
    const preTurnEvent = result.lifecycleEvents.find(
      (e) => e.eventUuid === "a0"
    );
    expect(preTurnEvent!.turnNumber).toBe(0);

    // The actual turn is turn 1
    const turnEvent = result.lifecycleEvents.find(
      (e) => e.eventUuid === "a1"
    );
    expect(turnEvent!.turnNumber).toBe(1);

    // There should be a turn 0 record for pre-turn events
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].turnNumber).toBe(0);
    expect(result.turns[1].turnNumber).toBe(1);
  });

  it("eventUuid is set from event.uuid", () => {
    const u1 = makeUserEvent({
      uuid: "specific-uuid-123",
      timestamp: "2026-03-28T10:00:00Z",
    });

    const result = buildLifecycleRecords("s1", [u1], emptyMeta);

    expect(result.lifecycleEvents[0].eventUuid).toBe("specific-uuid-123");
  });
});

describe("processNewEvents", () => {
  it("with null state initializes correctly", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({ timestamp: "2026-03-28T10:01:00Z" });

    const { records, state } = processNewEvents(
      "s1",
      [u1, a1],
      emptyMeta,
      null
    );

    expect(state.currentTurnNumber).toBe(1);
    expect(state.lastEventTimestamp).toBe("2026-03-28T10:01:00Z");
    expect(records.lifecycleEvents).toHaveLength(2);
  });

  it("mid-turn extends current turn without new boundary", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({
      timestamp: "2026-03-28T10:01:00Z",
      stop_reason: "tool_use",
    });

    const { state: state1 } = processNewEvents("s1", [u1, a1], emptyMeta, null);

    // Second batch: more events in the same turn (no new user event)
    const a2 = makeAssistantEvent({ timestamp: "2026-03-28T10:02:00Z" });
    const { records, state: state2 } = processNewEvents(
      "s1",
      [a2],
      emptyMeta,
      state1
    );

    // No new completed turns emitted (still in same turn)
    expect(records.turns).toHaveLength(0);
    expect(state2.currentTurnNumber).toBe(1);
    expect(records.lifecycleEvents).toHaveLength(1);
  });

  it("new boundary finalizes previous turn", () => {
    const u1 = makeUserEvent({ timestamp: "2026-03-28T10:00:00Z" });
    const a1 = makeAssistantEvent({ timestamp: "2026-03-28T10:01:00Z" });

    const { state: state1 } = processNewEvents("s1", [u1, a1], emptyMeta, null);

    // Second batch: new turn boundary
    const u2 = makeUserEvent({
      timestamp: "2026-03-28T10:02:00Z",
      message: { role: "user", content: [{ type: "text", text: "next question" }] },
    });
    const a2 = makeAssistantEvent({ timestamp: "2026-03-28T10:03:00Z" });

    const { records, state: state2 } = processNewEvents(
      "s1",
      [u2, a2],
      emptyMeta,
      state1
    );

    // Previous turn should be finalized
    expect(records.turns).toHaveLength(1);
    expect(records.turns[0].turnNumber).toBe(1);
    expect(records.turns[0].status).toBe("completed");
    expect(state2.currentTurnNumber).toBe(2);
  });
});

describe("createInitialState", () => {
  it("returns a valid initial state", () => {
    const state = createInitialState();

    expect(state.currentTurnNumber).toBe(0);
    expect(state.pendingTurnStartTime).toBeNull();
    expect(state.pendingTurnPrompt).toBe("");
    expect(state.knownAgents).toBeInstanceOf(Map);
    expect(state.knownAgents.size).toBe(0);
    expect(state.lastEventTimestamp).toBeNull();
  });
});
