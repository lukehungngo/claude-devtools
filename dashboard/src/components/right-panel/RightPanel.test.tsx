/**
 * Tests for RightPanel bidirectional turn sync (TASK-004)
 *
 * Verifies that externalActiveIndex prop drives activeSnapshotIndex,
 * enabling the middle-panel→right-panel sync direction.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightPanel } from "./RightPanel";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent } from "../../lib/types";

// jsdom does not implement ResizeObserver; stub it for XYFlow
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom does not implement scrollIntoView; stub it on HTMLElement
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
});

// Minimal turn factory
function makeTurn(n: number): TurnSnapshot {
  return {
    turnNumber: n,
    startTime: `2026-01-01T00:00:0${n}Z`,
    endTime: `2026-01-01T00:00:0${n}Z`,
    completedAt: `2026-01-01T00:00:0${n}Z`,
    status: "completed",
    promptText: `Prompt ${n}`,
    events: [] as SessionEvent[],
    startIndex: 0,
    endIndex: 0,
    agents: [],
    cost: 0,
    costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
    durationMs: null,
  };
}

describe("RightPanel externalActiveIndex", () => {
  it("renders snapshot badge for the turn at externalActiveIndex when provided", () => {
    // Use dag=null so AgentFlowDAG (which needs ResizeObserver/canvas) is not rendered
    const turns = [makeTurn(1), makeTurn(2), makeTurn(3), makeTurn(4)];
    const onSnapshotSelect = vi.fn();

    render(
      <RightPanel
        turns={turns}
        dag={null}
        events={[]}
        agents={[]}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={vi.fn()}
        onSnapshotSelect={onSnapshotSelect}
        externalActiveIndex={2}
      />
    );

    // externalActiveIndex=2 → turns[2] has turnNumber=3
    // The freeze/live badge shows "Snapshot · Turn 3"
    expect(screen.getByText(/Turn 3/)).toBeTruthy();
  });

  it("does not call onSnapshotSelect when externalActiveIndex changes (no feedback loop)", () => {
    const turns = [makeTurn(1), makeTurn(2), makeTurn(3), makeTurn(4)];
    const onSnapshotSelect = vi.fn();

    const { rerender } = render(
      <RightPanel
        turns={turns}
        dag={null}
        events={[]}
        agents={[]}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={vi.fn()}
        onSnapshotSelect={onSnapshotSelect}
        externalActiveIndex={null}
      />
    );

    onSnapshotSelect.mockClear();

    rerender(
      <RightPanel
        turns={turns}
        dag={null}
        events={[]}
        agents={[]}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={vi.fn()}
        onSnapshotSelect={onSnapshotSelect}
        externalActiveIndex={1}
      />
    );

    // onSnapshotSelect must NOT be called from the effect — only from user interaction
    expect(onSnapshotSelect).not.toHaveBeenCalled();
  });
});
