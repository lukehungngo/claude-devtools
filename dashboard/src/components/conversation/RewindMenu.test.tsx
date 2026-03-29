import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RewindMenu } from "./RewindMenu";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent } from "../../lib/types";

// Mock fetch for dry-run preview requests
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ canRewind: true, filesChanged: [], insertions: 0, deletions: 0 }),
});
vi.stubGlobal("fetch", mockFetch);

/** Create a minimal user event with the given uuid. */
function makeUserEvent(uuid: string): SessionEvent {
  return {
    type: "user",
    uuid,
    timestamp: "2026-03-29T12:30:00Z",
    sessionId: "sess-1",
    message: { role: "user", content: [{ type: "text", text: "test" }] },
    userType: "external",
  } as SessionEvent;
}

function makeTurn(overrides: Partial<TurnSnapshot> & { userUuid?: string } = {}): TurnSnapshot {
  const { userUuid = "msg-001", ...rest } = overrides;
  return {
    turnNumber: 1,
    promptText: "Set up the project structure",
    events: [makeUserEvent(userUuid)],
    startIndex: 0,
    endIndex: 1,
    status: "completed",
    durationMs: 5000,
    cost: 0.04,
    costBreakdown: { total: 0.04, tokensIn: 1000, tokensOut: 500 },
    startTime: "2026-03-29T12:30:00Z",
    completedAt: "2026-03-29T12:30:05Z",
    endTime: "2026-03-29T12:30:05Z",
    agents: [],
    ...rest,
  };
}

describe("RewindMenu", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the rewind menu with turns", () => {
    const turns = [
      makeTurn({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" }),
      makeTurn({ turnNumber: 2, promptText: "Second turn", userUuid: "msg-2" }),
    ];

    render(
      <RewindMenu
        turns={turns}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    expect(screen.getByText("Rewind Conversation")).toBeTruthy();
    expect(screen.getByText(/First turn/)).toBeTruthy();
    expect(screen.getByText(/Second turn/)).toBeTruthy();
  });

  it("shows empty state when no turns", () => {
    render(
      <RewindMenu
        turns={[]}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    expect(screen.getByText(/No turns to rewind to/)).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <RewindMenu
        turns={[makeTurn()]}
        sessionId="sess-1"
        onClose={onClose}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Close rewind menu"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <RewindMenu
        turns={[makeTurn()]}
        sessionId="sess-1"
        onClose={onClose}
        onRewind={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects a turn on click and shows action panel", () => {
    const turns = [
      makeTurn({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" }),
      makeTurn({ turnNumber: 2, promptText: "Second turn", userUuid: "msg-2" }),
    ];

    render(
      <RewindMenu
        turns={turns}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Second turn/));
    expect(screen.getByText("Restore code + conversation")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("calls onRewind with correct user message UUID when Restore all is clicked", async () => {
    const onRewind = vi.fn().mockResolvedValue(undefined);
    const turns = [
      makeTurn({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" }),
    ];

    render(
      <RewindMenu
        turns={turns}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={onRewind}
      />
    );

    fireEvent.click(screen.getByText(/First turn/));

    // Wait for the action panel to appear (after state update from handleSelectTurn)
    const restoreBtn = await screen.findByText("Restore code + conversation");
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(onRewind).toHaveBeenCalledWith("msg-1", false);
    });
  });

  it("disables current turn (last turn cannot be rewound to)", () => {
    const turns = [
      makeTurn({ turnNumber: 1, promptText: "Old turn", userUuid: "msg-1" }),
      makeTurn({ turnNumber: 2, promptText: "Current turn", userUuid: "msg-2" }),
    ];

    render(
      <RewindMenu
        turns={turns}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
        currentTurnNumber={2}
      />
    );

    // Current turn should be visually marked (opacity reduced)
    const currentItem = screen.getByText(/Current turn/).closest("[data-turn]");
    expect(currentItem?.getAttribute("data-disabled")).toBe("true");
  });
});
