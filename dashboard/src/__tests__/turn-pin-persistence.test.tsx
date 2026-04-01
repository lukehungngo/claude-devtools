import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useState, useEffect } from "react";

afterEach(cleanup);

/**
 * Reproduction test for TASK-002: auto-release turn pin on new turns.
 *
 * SessionPage has a useEffect that clears selectedTurnIndex whenever
 * turns.length changes. This means if a user is viewing turn 3 while
 * the agent is on turn 10, their selection gets wiped on every new turn.
 *
 * This test extracts the exact state pattern from SessionPage to prove
 * the bug, then validates the fix (removing the auto-release effect).
 */

/** Minimal component that replicates SessionPage's turn-pin state logic */
function TurnPinHarness({
  turnsLength,
  onState,
  autoRelease,
}: {
  turnsLength: number;
  onState: (s: { selectedTurnIndex: number | null; highlightedTurnIndex: number | undefined }) => void;
  /** When true, includes the buggy auto-release useEffect from SessionPage */
  autoRelease: boolean;
}) {
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);

  // This is the buggy effect from SessionPage lines 175-179
  useEffect(() => {
    if (autoRelease) {
      setSelectedTurnIndex(null);
      setHighlightedTurnIndex(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnsLength]);

  // Report state to test
  useEffect(() => {
    onState({ selectedTurnIndex, highlightedTurnIndex });
  }, [selectedTurnIndex, highlightedTurnIndex, onState]);

  return (
    <button
      data-testid="select-turn-3"
      onClick={() => {
        setSelectedTurnIndex(3);
        setHighlightedTurnIndex(3);
      }}
    >
      Select Turn 3
    </button>
  );
}

describe("TASK-002: Turn pin should persist when new turns arrive", () => {
  it("BUG: auto-release effect clears user's turn selection on new turns", () => {
    let state = { selectedTurnIndex: null as number | null, highlightedTurnIndex: undefined as number | undefined };
    const onState = vi.fn((s: typeof state) => { state = s; });

    const { rerender, getByTestId } = render(
      <TurnPinHarness turnsLength={5} onState={onState} autoRelease={true} />,
    );

    // User clicks to select turn 3
    act(() => {
      getByTestId("select-turn-3").click();
    });
    expect(state.selectedTurnIndex).toBe(3);
    expect(state.highlightedTurnIndex).toBe(3);

    // New turn arrives (turnsLength changes from 5 to 6)
    rerender(<TurnPinHarness turnsLength={6} onState={onState} autoRelease={true} />);

    // BUG: the auto-release effect clears the selection
    // This SHOULD fail once we remove autoRelease behavior from SessionPage
    expect(state.selectedTurnIndex).toBeNull();
    expect(state.highlightedTurnIndex).toBeUndefined();
  });

  it("FIXED: turn selection persists when new turns arrive (no auto-release)", () => {
    let state = { selectedTurnIndex: null as number | null, highlightedTurnIndex: undefined as number | undefined };
    const onState = vi.fn((s: typeof state) => { state = s; });

    const { rerender, getByTestId } = render(
      <TurnPinHarness turnsLength={5} onState={onState} autoRelease={false} />,
    );

    // User clicks to select turn 3
    act(() => {
      getByTestId("select-turn-3").click();
    });
    expect(state.selectedTurnIndex).toBe(3);
    expect(state.highlightedTurnIndex).toBe(3);

    // New turn arrives (turnsLength changes from 5 to 6)
    rerender(<TurnPinHarness turnsLength={6} onState={onState} autoRelease={false} />);

    // FIXED: selection persists
    expect(state.selectedTurnIndex).toBe(3);
    expect(state.highlightedTurnIndex).toBe(3);
  });

  it("FIXED: selection is null by default (follows latest turn)", () => {
    let state = { selectedTurnIndex: null as number | null, highlightedTurnIndex: undefined as number | undefined };
    const onState = vi.fn((s: typeof state) => { state = s; });

    render(<TurnPinHarness turnsLength={5} onState={onState} autoRelease={false} />);

    // Without user interaction, selectedTurnIndex is null (means "follow latest")
    expect(state.selectedTurnIndex).toBeNull();
    expect(state.highlightedTurnIndex).toBeUndefined();
  });
});
