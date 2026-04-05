import { describe, it, expect, afterEach, vi, type Mock } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentLogTab } from "./AgentLogTab";
import type { SessionEvent, AssistantEvent, SubagentMeta } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

// Capture events passed to AgentLogs so we can verify filtering
// without relying on virtualized DOM rendering.
let capturedEvents: SessionEvent[] = [];
vi.mock("../AgentLogs", () => ({
  AgentLogs: (props: { events: SessionEvent[] }) => {
    capturedEvents = props.events;
    if (props.events.length === 0) {
      return <div>Select a session to view agent timeline</div>;
    }
    const agentIds = new Set(props.events.map((e) => e.agentId || "main"));
    return (
      <div>
        <span>Agent Timeline</span>
        <span>{agentIds.size} agents</span>
        {Array.from(agentIds).map((id) => (
          <span key={id}>{id}</span>
        ))}
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  capturedEvents = [];
});

function makeAssistantEvent(
  overrides: Partial<AssistantEvent> = {},
): AssistantEvent {
  return {
    type: "assistant",
    uuid: crypto.randomUUID(),
    timestamp: "2026-04-01T10:00:00.000Z",
    sessionId: "sess-1",
    message: {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello world" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message" as const,
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    ...overrides,
  } as AssistantEvent;
}

describe("AgentLogTab", () => {
  it("renders without crashing with empty events", () => {
    render(<AgentLogTab allEvents={[]} />);
    expect(screen.getByText("Select a session to view agent timeline")).toBeTruthy();
  });

  it("renders events and shows Agents Log header", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main", timestamp: "2026-04-01T10:00:00.000Z" }),
    ];
    render(<AgentLogTab allEvents={events} />);
    expect(screen.getByText("Agent Timeline")).toBeTruthy();
  });

  it("passes subagentMeta through to AgentLogs", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "agent-abc", timestamp: "2026-04-01T10:00:00.000Z" }),
    ];
    const meta: SubagentMeta = {
      "agent-abc": { agentType: "researcher", description: "Research specialist" },
    };
    // Should not throw with subagentMeta
    render(<AgentLogTab allEvents={events} subagentMeta={meta} />);
    expect(screen.getByText("Agent Timeline")).toBeTruthy();
  });

  it("passes dag nodes through to AgentLogs", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const dag = {
      nodes: [{ id: "main", type: "main", label: "main", status: "completed" as const, tokenUsage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 }, toolCalls: 0, mcpToolCalls: 0, startTime: "2026-04-01T10:00:00.000Z" }],
      edges: [],
    };
    render(<AgentLogTab allEvents={events} dag={dag} />);
    expect(screen.getByText("1 agents")).toBeTruthy();
  });

  it("filters events to selected turn when activeTurnIndex and turns are provided", () => {
    // Create events from two different agents so we can verify filtering
    // by checking the agent count in the rendered header.
    // Turn 1: agent "alpha" (index 0)
    // Turn 2: agent "beta" (index 1)
    const turn1Event = makeAssistantEvent({
      agentId: "alpha",
      uuid: "evt-turn1",
      timestamp: "2026-04-01T10:00:00.000Z",
    });
    const turn2Event = makeAssistantEvent({
      agentId: "beta",
      uuid: "evt-turn2",
      timestamp: "2026-04-01T10:01:00.000Z",
    });

    const allEvents: SessionEvent[] = [turn1Event, turn2Event];

    const turns: TurnSnapshot[] = [
      {
        turnNumber: 1,
        promptText: "Turn 1",
        startIndex: 0,
        endIndex: 1,
        agents: [],
        status: "completed",
        durationMs: 1000,
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        startTime: "2026-04-01T10:00:00.000Z",
        completedAt: "2026-04-01T10:00:01.000Z",
        endTime: "2026-04-01T10:00:01.000Z",
      },
      {
        turnNumber: 2,
        promptText: "Turn 2",
        startIndex: 1,
        endIndex: 2,
        agents: [],
        status: "completed",
        durationMs: 1000,
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        startTime: "2026-04-01T10:01:00.000Z",
        completedAt: "2026-04-01T10:01:01.000Z",
        endTime: "2026-04-01T10:01:01.000Z",
      },
    ];

    // Select turn 2 (index 1) — should only pass agent "beta" events
    render(
      <AgentLogTab allEvents={allEvents} activeTurnIndex={1} turns={turns} />,
    );

    // Verify only the turn-2 event was passed to AgentLogs
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].agentId).toBe("beta");
    // The mock renders agent ids — "beta" should be present, "alpha" should not
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("passes all events when activeTurnIndex is null", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "alpha", uuid: "evt-1", timestamp: "2026-04-01T10:00:00.000Z" }),
      makeAssistantEvent({ agentId: "beta", uuid: "evt-2", timestamp: "2026-04-01T10:01:00.000Z" }),
    ];

    // When no turn is selected, AgentLogTab should pass all events through.
    render(
      <AgentLogTab allEvents={events} activeTurnIndex={null} turns={[]} />,
    );

    // All events should be passed to AgentLogs unfiltered
    expect(capturedEvents).toHaveLength(2);
    expect(screen.getByText("Agent Timeline")).toBeTruthy();
    expect(screen.getByText("2 agents")).toBeTruthy();
  });
});
