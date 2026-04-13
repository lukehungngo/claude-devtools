/**
 * Tests for TurnCard v4 avatar-based message layout.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TurnCard } from "./TurnCard";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent } from "../../lib/types";

function makeAssistantEvent(text: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: "asst-1",
    timestamp: "2026-01-01T00:00:01Z",
    sessionId: "sess-1",
    agentId: "main",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "end_turn",
    },
  } as AssistantEvent;
}

function makeTurnAndEvents(
  overrides: Partial<TurnSnapshot> = {},
  events: SessionEvent[] = [],
): { turn: TurnSnapshot; allEvents: SessionEvent[] } {
  return {
    turn: {
      turnNumber: 1,
      promptText: "Hello world",
      startTime: "2026-01-01T00:00:00Z",
      status: "done",
      cost: 0,
      agents: [],
      startIndex: 0,
      endIndex: events.length,
      durationMs: null,
      costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
      endTime: "",
      completedAt: "",
      ...overrides,
    } as TurnSnapshot,
    allEvents: events,
  };
}

describe("TurnCard — avatar-based message layout", () => {
  it("renders user avatar and prompt text", () => {
    const { turn, allEvents } = makeTurnAndEvents();
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const card = container.querySelector(".conv-turn") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("U");
    expect(card.textContent).toContain("You");
    expect(card.textContent).toContain("Hello world");
  });

  it("renders Claude avatar and response when events present", () => {
    const evts = [makeAssistantEvent("I can help with that.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("Claude");
    expect(container.textContent).toContain("I can help with that.");
  });

  it("fires onTurnClick when the card is clicked", () => {
    const onTurnClick = vi.fn();
    const { turn, allEvents } = makeTurnAndEvents();
    const { container } = render(
      <TurnCard turn={turn} allEvents={allEvents} onTurnClick={onTurnClick} />
    );

    const card = container.querySelector(".conv-turn") as HTMLElement;
    fireEvent.click(card);

    expect(onTurnClick).toHaveBeenCalledTimes(1);
  });
});

describe("TurnCard — completion indicator", () => {
  it("shows 'Generating...' for a running turn", () => {
    const evts = [makeAssistantEvent("Working on it...")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { status: "running", durationMs: null, endTime: "", completedAt: "" },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Generating...");
  });

  it("shows 'Completed in Xs' for a completed turn with durationMs", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      {
        status: "completed",
        durationMs: 45000,
        startTime: "2026-03-29T14:30:00Z",
        endTime: "2026-03-29T14:30:45Z",
        completedAt: "2026-03-29T14:30:45Z",
      },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed in");
    expect(indicator!.textContent).toContain("45.0s");
  });

  it("shows 'Completed' without duration when durationMs is null", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { status: "completed", durationMs: null },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed");
    expect(indicator!.textContent).not.toContain("Completed in");
  });

  it("shows 'Completed' when turn.status is running but sessionIsRunning is false (stale session)", () => {
    const evts = [makeAssistantEvent("Working...")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { status: "running", durationMs: null, endTime: "", completedAt: "" },
      evts,
    );
    const { container } = render(
      <TurnCard turn={turn} allEvents={allEvents} sessionIsRunning={false} />,
    );

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed");
    expect(indicator!.textContent).not.toContain("Generating...");
  });
});

describe("TurnCard — CostFooter wiring", () => {
  it("renders CostFooter when turn.cost > 0", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      {
        cost: 0.0035,
        costBreakdown: { total: 0.0035, inputCost: 0.002, outputCost: 0.0015 },
        agents: [
          {
            agentId: "agent-1",
            agentType: "Task",
            displayName: "Task Agent",
            invocationCount: 1,
            status: "completed" as const,
            cost: 0.001,
            tokensIn: 100,
            tokensOut: 50,
            tools: ["read_file"],
          },
        ],
      },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const costFooter = container.querySelector('[aria-label="Cost breakdown"]');
    expect(costFooter).not.toBeNull();
    expect(costFooter!.textContent).toContain("$0.0035");
    expect(costFooter!.textContent).toContain("agents");
  });

  it("does NOT render CostFooter when turn.cost is 0", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { cost: 0, agents: [] },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const costFooter = container.querySelector('[aria-label="Cost breakdown"]');
    expect(costFooter).toBeNull();
  });
});

describe("TurnCard — DOM order: tool entries before response text", () => {
  it("renders .conv-tool-entries before .msg-text in the DOM", () => {
    // Event 0: assistant with tool_use — makes this event index the lastToolUseIdx
    const toolUseEvent: AssistantEvent = {
      type: "assistant",
      uuid: "asst-tool",
      timestamp: "2026-01-01T00:00:01Z",
      sessionId: "sess-1",
      agentId: "main",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/foo" } },
        ],
        model: "claude-sonnet-4-5",
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "tool_use",
      },
    } as unknown as AssistantEvent;

    // Event 1: tool result (user event) — needed to pair with tool_use
    const toolResultEvent = {
      type: "user",
      uuid: "user-result",
      timestamp: "2026-01-01T00:00:02Z",
      sessionId: "sess-1",
      agentId: "main",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1", content: "file contents" },
        ],
      },
    } as unknown as SessionEvent;

    // Event 2: assistant text that comes AFTER tool_use — non-narration → renders as .msg-text
    const finalTextEvent: AssistantEvent = {
      type: "assistant",
      uuid: "asst-text",
      timestamp: "2026-01-01T00:00:03Z",
      sessionId: "sess-1",
      agentId: "main",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Here is the final answer." }],
        model: "claude-sonnet-4-5",
        usage: { input_tokens: 15, output_tokens: 10 },
        stop_reason: "end_turn",
      },
    } as unknown as AssistantEvent;

    const allEvents: SessionEvent[] = [toolUseEvent, toolResultEvent, finalTextEvent];

    const turn: TurnSnapshot = {
      turnNumber: 1,
      promptText: "Read a file",
      startTime: "2026-01-01T00:00:00Z",
      status: "completed",
      cost: 0,
      agents: [],
      startIndex: 0,
      endIndex: allEvents.length,
      durationMs: null,
      costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
      endTime: "2026-01-01T00:00:03Z",
      completedAt: "2026-01-01T00:00:03Z",
    } as TurnSnapshot;

    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const toolEntries = container.querySelector(".conv-tool-entries");
    const msgText = container.querySelector(".msg-text");

    expect(toolEntries).not.toBeNull();
    expect(msgText).not.toBeNull();

    // Node.DOCUMENT_POSITION_FOLLOWING (4) means toolEntries comes before msgText
    const position = toolEntries!.compareDocumentPosition(msgText!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("TurnCard — CollapsiblePrompt wiring", () => {
  it("renders CollapsiblePrompt for user prompt text", () => {
    const { turn, allEvents } = makeTurnAndEvents({ promptText: "Hello world" });
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const collapsiblePrompt = container.querySelector('[data-testid="collapsible-prompt"]');
    expect(collapsiblePrompt).not.toBeNull();
    expect(collapsiblePrompt!.textContent).toContain("Hello world");
  });

  it("renders CollapsiblePrompt with expand toggle for long prompt", () => {
    const longPrompt = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} of a very long prompt message`).join("\n");
    const { turn, allEvents } = makeTurnAndEvents({ promptText: longPrompt });
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const collapsiblePrompt = container.querySelector('[data-testid="collapsible-prompt"]');
    expect(collapsiblePrompt).not.toBeNull();

    // Should have an expand toggle for long content
    const expandToggle = container.querySelector('[data-testid="expand-toggle"]');
    expect(expandToggle).not.toBeNull();
    expect(expandToggle!.textContent).toMatch(/\+\d+ lines/);
  });

  it("renders CollapsiblePrompt with CommandPill for slash commands", () => {
    const { turn, allEvents } = makeTurnAndEvents({ promptText: "/help" });
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const commandPill = container.querySelector('[data-testid="command-pill"]');
    expect(commandPill).not.toBeNull();
    expect(commandPill!.textContent).toContain("/help");
  });

  it("short prompt renders via CollapsiblePrompt without expand toggle", () => {
    const { turn, allEvents } = makeTurnAndEvents({ promptText: "Fix the bug" });
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const collapsiblePrompt = container.querySelector('[data-testid="collapsible-prompt"]');
    expect(collapsiblePrompt).not.toBeNull();

    const expandToggle = container.querySelector('[data-testid="expand-toggle"]');
    expect(expandToggle).toBeNull();
  });
});

describe("TurnCard model badge", () => {
  // TurnFooter (which hosts the badge) is inside the Claude message section,
  // which only renders when there are turn events — supply one assistant event.
  function makeTurnWithModel(model: string | undefined) {
    const asstEvent = makeAssistantEvent("response");
    return makeTurnAndEvents(
      { model, endIndex: 1, status: "completed" as const },
      [asstEvent],
    );
  }

  it("renders model badge with shortened name", () => {
    const { turn, allEvents } = makeTurnWithModel("claude-sonnet-4-6");
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);
    const badge = container.querySelector('[data-testid="turn-model-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("sonnet-4-6");
  });

  it("strips date suffix from model name", () => {
    const { turn, allEvents } = makeTurnWithModel("claude-haiku-4-5-20251001");
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);
    const badge = container.querySelector('[data-testid="turn-model-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("haiku-4-5");
  });

  it("does not render model badge when model is absent", () => {
    const { turn, allEvents } = makeTurnWithModel(undefined);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);
    const badge = container.querySelector('[data-testid="turn-model-badge"]');
    expect(badge).toBeNull();
  });
});

