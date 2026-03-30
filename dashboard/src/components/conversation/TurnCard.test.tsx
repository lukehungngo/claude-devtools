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
      costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
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
});
