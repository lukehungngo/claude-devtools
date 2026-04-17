import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RewindMenu } from "./RewindMenu";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent } from "../../lib/types";

// Mock TanStack Router
const mockNavigate = vi.fn().mockResolvedValue(undefined);
const mockUseParams = vi.fn().mockReturnValue({ repoSlug: "test-repo", sessionId: "sess-1" });
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useParams: (...args: unknown[]) => mockUseParams(...args),
}));

// Mock fetch for dry-run preview requests
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
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

function makeTurnAndEvents(
  overrides: Partial<TurnSnapshot> & { userUuid?: string } = {},
  startIdx = 0,
): { turn: TurnSnapshot; events: SessionEvent[] } {
  const { userUuid = "msg-001", ...rest } = overrides;
  const events = [makeUserEvent(userUuid)];
  return {
    turn: {
      turnNumber: 1,
      promptText: "Set up the project structure",
      startIndex: startIdx,
      endIndex: startIdx + 1,
      durationMs: 5000,
      cost: 0.04,
      costBreakdown: { total: 0.04, inputCost: 0.025, outputCost: 0.015 },
      startTime: "2026-03-29T12:30:00Z",
      endTime: "2026-03-29T12:30:05Z",
      agents: [],
      dispatchedAgentIds: new Set<string>(["main"]),
      ...rest,
    },
    events,
  };
}

describe("RewindMenu", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockNavigate.mockClear();
    mockUseParams.mockReturnValue({ repoSlug: "test-repo", sessionId: "sess-1" });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the rewind menu with turns", () => {
    const t1 = makeTurnAndEvents({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" }, 0);
    const t2 = makeTurnAndEvents({ turnNumber: 2, promptText: "Second turn", userUuid: "msg-2" }, 1);
    const allEvents = [...t1.events, ...t2.events];

    render(
      <RewindMenu
        turns={[t1.turn, t2.turn]}
        allEvents={allEvents}
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
        allEvents={[]}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    expect(screen.getByText(/No turns to rewind to/)).toBeTruthy();
  });

  it("renders Fork session button even when turns is empty", () => {
    render(
      <RewindMenu
        turns={[]}
        allEvents={[]}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /fork this session/i })).toBeTruthy();
    expect(screen.getByText("Fork session")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
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
    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={onClose}
        onRewind={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects a turn on click and shows action panel", () => {
    const t1 = makeTurnAndEvents({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" }, 0);
    const t2 = makeTurnAndEvents({ turnNumber: 2, promptText: "Second turn", userUuid: "msg-2" }, 1);
    const allEvents = [...t1.events, ...t2.events];

    render(
      <RewindMenu
        turns={[t1.turn, t2.turn]}
        allEvents={allEvents}
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
    const { turn, events } = makeTurnAndEvents({ turnNumber: 1, promptText: "First turn", userUuid: "msg-1" });

    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
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

  it("renders Fork session button", () => {
    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /fork this session/i })).toBeTruthy();
    expect(screen.getByText("Fork session")).toBeTruthy();
  });

  it("sends POST to /api/sessions/:id/fork on Fork session click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sessionId: "new-abc-123" }),
    });

    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fork this session/i }));

    await waitFor(() => {
      const forkCall = mockFetch.mock.calls.find(
        (args: unknown[]) =>
          args[0] === "/api/sessions/sess-1/fork" && (args[1] as RequestInit)?.method === "POST"
      );
      expect(forkCall).toBeTruthy();
    });
  });

  it("navigates to new session on fork success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sessionId: "new-abc-123" }),
    });

    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fork this session/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/session/$repoSlug/$sessionId",
        params: { repoSlug: "test-repo", sessionId: "new-abc-123" },
      });
    });
  });

  it("shows error message when fork fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fork this session/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText("Failed to fork session")).toBeTruthy();
    });
  });

  it("re-enables fork button after failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fork this session/i }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /fork this session/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  it("fork success but no repoSlug shows error and does not navigate", async () => {
    mockUseParams.mockReturnValue({ repoSlug: undefined, sessionId: "sess-1" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sessionId: "new-abc-123" }),
    });

    const { turn, events } = makeTurnAndEvents();
    render(
      <RewindMenu
        turns={[turn]}
        allEvents={events}
        sessionId="sess-1"
        onClose={vi.fn()}
        onRewind={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fork this session/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText(/Cannot fork: repo context unavailable/)).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("disables current turn (last turn cannot be rewound to)", () => {
    const t1 = makeTurnAndEvents({ turnNumber: 1, promptText: "Old turn", userUuid: "msg-1" }, 0);
    const t2 = makeTurnAndEvents({ turnNumber: 2, promptText: "Current turn", userUuid: "msg-2" }, 1);
    const allEvents = [...t1.events, ...t2.events];

    render(
      <RewindMenu
        turns={[t1.turn, t2.turn]}
        allEvents={allEvents}
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
