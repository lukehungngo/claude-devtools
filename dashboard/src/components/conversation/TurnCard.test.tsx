/**
 * Tests for TurnCard v4 avatar-based message layout.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TurnCard } from "./TurnCard";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { AssistantEvent } from "../../lib/types";

function makeTurn(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "Hello world",
    startTime: "2026-01-01T00:00:00Z",
    status: "done",
    cost: 0,
    agents: [],
    events: [],
    ...overrides,
  } as TurnSnapshot;
}

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

describe("TurnCard — avatar-based message layout", () => {
  it("renders user avatar and prompt text", () => {
    const { container } = render(<TurnCard turn={makeTurn()} />);

    const card = container.querySelector(".conv-turn") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("U");
    expect(card.textContent).toContain("You");
    expect(card.textContent).toContain("Hello world");
  });

  it("renders Claude avatar and response when events present", () => {
    const turn = makeTurn({
      events: [makeAssistantEvent("I can help with that.")],
    });
    const { container } = render(<TurnCard turn={turn} />);

    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("Claude");
    expect(container.textContent).toContain("I can help with that.");
  });

  it("fires onTurnClick when the card is clicked", () => {
    const onTurnClick = vi.fn();
    const { container } = render(
      <TurnCard turn={makeTurn()} onTurnClick={onTurnClick} />
    );

    const card = container.querySelector(".conv-turn") as HTMLElement;
    fireEvent.click(card);

    expect(onTurnClick).toHaveBeenCalledTimes(1);
  });
});

describe("TurnCard — completion indicator", () => {
  it("shows 'Generating...' for a running turn", () => {
    const turn = makeTurn({
      status: "running",
      durationMs: null,
      endTime: "",
      completedAt: "",
      events: [makeAssistantEvent("Working on it...")],
    });
    const { container } = render(<TurnCard turn={turn} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Generating...");
  });

  it("shows 'Completed in Xs' for a completed turn with durationMs", () => {
    const turn = makeTurn({
      status: "completed",
      durationMs: 45000,
      startTime: "2026-03-29T14:30:00Z",
      endTime: "2026-03-29T14:30:45Z",
      completedAt: "2026-03-29T14:30:45Z",
      events: [makeAssistantEvent("Done.")],
    });
    const { container } = render(<TurnCard turn={turn} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed in");
    expect(indicator!.textContent).toContain("45.0s");
  });

  it("shows 'Completed' without duration when durationMs is null", () => {
    const turn = makeTurn({
      status: "completed",
      durationMs: null,
      events: [makeAssistantEvent("Done.")],
    });
    const { container } = render(<TurnCard turn={turn} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed");
    expect(indicator!.textContent).not.toContain("Completed in");
  });
});
