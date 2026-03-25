import { describe, it, expect } from "vitest";
import { groupEventsIntoTurns } from "./turnSnapshot";
import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
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

  it("detects completed status when last event has stop_reason end_turn", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ text: "Go", timestamp: "2026-01-01T00:00:00Z" }),
      makeAssistantEvent({
        stopReason: "end_turn",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];
    const turns = groupEventsIntoTurns(events);
    expect(turns[0].status).toBe("completed");
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
