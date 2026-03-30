/**
 * Tests for TurnCard memoization (Fix 2).
 * Verifies that React.memo comparator prevents unnecessary re-renders.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoTurnCard, turnCardAreEqual } from "./TurnCard";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent } from "../../lib/types";

const mockAllEvents: SessionEvent[] = [
  { type: "user", uuid: "u1", timestamp: "2026-01-01T00:00:00Z", sessionId: "s1" } as SessionEvent,
];

function makeTurn(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "Hello world",
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:00:05Z",
    completedAt: "",
    status: "running",
    cost: 0,
    costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
    agents: [],
    startIndex: 0,
    endIndex: 1,
    durationMs: null,
    ...overrides,
  };
}

describe("turnCardAreEqual comparator", () => {
  const baseProps = {
    turn: makeTurn(),
    allEvents: mockAllEvents,
    isHighlighted: false,
    onAgentPillClick: undefined,
    onTurnClick: undefined,
  };

  it("returns true when all compared fields are equal", () => {
    expect(turnCardAreEqual(baseProps, { ...baseProps })).toBe(true);
  });

  it("returns false when turnNumber changes", () => {
    const next = { ...baseProps, turn: makeTurn({ turnNumber: 2 }) };
    expect(turnCardAreEqual(baseProps, next)).toBe(false);
  });

  it("returns false when status changes", () => {
    const next = { ...baseProps, turn: makeTurn({ status: "completed" }) };
    expect(turnCardAreEqual(baseProps, next)).toBe(false);
  });

  it("returns false when endIndex changes (event count proxy)", () => {
    const next = {
      ...baseProps,
      turn: makeTurn({ endIndex: 2 }),
    };
    expect(turnCardAreEqual(baseProps, next)).toBe(false);
  });

  it("returns false when durationMs changes", () => {
    const next = { ...baseProps, turn: makeTurn({ durationMs: 5000 }) };
    expect(turnCardAreEqual(baseProps, next)).toBe(false);
  });

  it("returns false when isHighlighted changes", () => {
    const next = { ...baseProps, isHighlighted: true };
    expect(turnCardAreEqual(baseProps, next)).toBe(false);
  });
});

describe("MemoTurnCard renders", () => {
  it("renders TurnCard content via MemoTurnCard", () => {
    const turn = makeTurn({ promptText: "Test prompt for memo" });
    const { container } = render(<MemoTurnCard turn={turn} allEvents={mockAllEvents} />);
    expect(container.querySelector(".conv-turn")).not.toBeNull();
    expect(container.textContent).toContain("Test prompt for memo");
  });
});
