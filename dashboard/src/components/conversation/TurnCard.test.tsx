/**
 * Tests for TurnCard event propagation (P1 bug fix).
 *
 * Verifies that clicking the collapse header does NOT fire onTurnClick
 * (the header's onClick must call e.stopPropagation() to prevent bubbling
 * up to the outer card div's onTurnClick handler).
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { TurnCard } from "./TurnCard";
import { formatTime } from "../../lib/formatTime";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

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

describe("TurnCard — header click does NOT bubble to onTurnClick", () => {
  it("clicking the header (collapse toggle) does not fire onTurnClick", () => {
    const onTurnClick = vi.fn();
    const { container } = render(
      <TurnCard turn={makeTurn()} onTurnClick={onTurnClick} />
    );

    // The header is the first direct child div inside the conv-turn card
    // It contains the expand icon and "PROMPT · TURN N" label
    const card = container.querySelector(".conv-turn") as HTMLElement;
    expect(card).not.toBeNull();

    // Find the header — it has cursor-pointer and contains "TURN 1"
    const header = card.querySelector(
      ".cursor-pointer.select-none"
    ) as HTMLElement;
    expect(header).not.toBeNull();

    fireEvent.click(header);

    // The header click should NOT propagate to the outer card's onTurnClick
    expect(onTurnClick).not.toHaveBeenCalled();
  });

  it("clicking the outer card (outside the header) does fire onTurnClick", () => {
    const onTurnClick = vi.fn();
    const { container } = render(
      <TurnCard turn={makeTurn()} onTurnClick={onTurnClick} />
    );

    const card = container.querySelector(".conv-turn") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(card);

    expect(onTurnClick).toHaveBeenCalledTimes(1);
  });
});

describe("TurnCard — completion indicator", () => {
  it("shows completion timestamp with checkmark for a completed turn", () => {
    const endTime = "2026-03-29T14:30:45Z";
    const turn = makeTurn({
      status: "completed",
      endTime,
      completedAt: endTime,
      costBreakdown: { total: 0.01, tokensIn: 100, tokensOut: 50 },
    });
    const { container } = render(<TurnCard turn={turn} isLastTurn={false} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    // Use formatTime for timezone-safe assertion
    const expectedTime = formatTime(endTime);
    expect(indicator!.textContent).toContain(expectedTime);
    // Should NOT show "Generating..."
    expect(indicator!.textContent).not.toContain("Generating...");
  });

  it("shows pulsing 'Generating...' for the last turn with no endTime", () => {
    const turn = makeTurn({
      status: "running" as TurnSnapshot["status"],
      endTime: "",
      completedAt: "",
      costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
    });
    const { container } = render(<TurnCard turn={turn} isLastTurn={true} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Generating...");
    expect(container.querySelector('[data-testid="turn-completion-timestamp"]')).toBeNull();
  });

  it("shows checkmark for a completed last turn (not streaming)", () => {
    const endTime = "2026-03-29T09:15:22Z";
    const turn = makeTurn({
      status: "completed",
      endTime,
      completedAt: endTime,
      costBreakdown: { total: 0.01, tokensIn: 100, tokensOut: 50 },
    });
    const { container } = render(<TurnCard turn={turn} isLastTurn={true} />);

    const expectedTime = formatTime(endTime);
    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain(expectedTime);
    expect(indicator!.textContent).not.toContain("Generating...");
  });
});
