/**
 * Tests for ConversationView bidirectional turn sync (TASK-004)
 *
 * Verifies that onTurnClick is called with the correct unfiltered turn index
 * when a turn's outer container is clicked.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";

// Mock scrollIntoView for jsdom (not implemented)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);
import { ConversationView } from "./ConversationView";
import { groupEventsIntoTurns } from "../../lib/turnSnapshot";
import type { UserEvent, AssistantEvent, PermissionRequest, SessionEvent } from "../../lib/types";

function makeUserEvent(text: string, index: number): UserEvent {
  return {
    type: "user",
    uuid: `user-${index}`,
    timestamp: `2026-01-01T00:00:0${index}Z`,
    sessionId: "sess-1",
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  } as UserEvent;
}

function makeAssistantEvent(index: number): AssistantEvent {
  return {
    type: "assistant",
    uuid: `asst-${index}`,
    timestamp: `2026-01-01T00:00:0${index}Z`,
    sessionId: "sess-1",
    agentId: "main",
    message: {
      role: "assistant",
      content: [{ type: "text", text: `Response ${index}` }],
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "end_turn",
    },
  } as AssistantEvent;
}

describe("ConversationView onTurnClick", () => {
  it("calls onTurnClick with the correct unfiltered turn index when a turn is clicked", () => {
    const onTurnClick = vi.fn();
    // Two turns: turn 0 and turn 1
    const events = [
      makeUserEvent("First prompt", 0),
      makeAssistantEvent(1),
      makeUserEvent("Second prompt", 2),
      makeAssistantEvent(3),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    const { container } = render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        onTurnClick={onTurnClick}
      />
    );

    // Click the first conv-turn card
    const turnCards = container.querySelectorAll(".conv-turn");
    expect(turnCards.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(turnCards[0]);

    expect(onTurnClick).toHaveBeenCalledWith(0);
  });

  it("calls onTurnClick with the correct index for the second turn", () => {
    const onTurnClick = vi.fn();
    const events = [
      makeUserEvent("First prompt", 0),
      makeAssistantEvent(1),
      makeUserEvent("Second prompt", 2),
      makeAssistantEvent(3),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    const { container } = render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        onTurnClick={onTurnClick}
      />
    );

    const turnCards = container.querySelectorAll(".conv-turn");
    expect(turnCards.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(turnCards[1]);

    expect(onTurnClick).toHaveBeenCalledWith(1);
  });
});

describe("ConversationView highlightedTurnIndex", () => {
  it("passes isSelected=true to TurnDivider when highlightedTurnIndex matches turn index", () => {
    const events = [
      makeUserEvent("First prompt", 0),
      makeAssistantEvent(1),
      makeUserEvent("Second prompt", 2),
      makeAssistantEvent(3),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        highlightedTurnIndex={1}
      />
    );

    // TurnDivider for the second turn should have aria-pressed="true"
    const buttons = screen.getAllByRole("button");
    const turnDividerButton = buttons.find(
      (b) => b.getAttribute("aria-label")?.startsWith("Go to turn")
    );
    expect(turnDividerButton).toBeDefined();
    expect(turnDividerButton!.getAttribute("aria-pressed")).toBe("true");
  });

  it("passes isSelected=false to TurnDivider when highlightedTurnIndex does not match", () => {
    const events = [
      makeUserEvent("First prompt", 0),
      makeAssistantEvent(1),
      makeUserEvent("Second prompt", 2),
      makeAssistantEvent(3),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        highlightedTurnIndex={0}
      />
    );

    // TurnDivider only exists for turn 1 (filteredIndex > 0).
    // With highlightedTurnIndex=0, the divider at turn 1 should have aria-pressed="false"
    const buttons = screen.getAllByRole("button");
    const turnDividerButton = buttons.find(
      (b) => b.getAttribute("aria-label")?.startsWith("Go to turn")
    );
    expect(turnDividerButton).toBeDefined();
    expect(turnDividerButton!.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ConversationView scroll-to-bottom button positioning", () => {
  it("renders the new-turns button inside a relatively-positioned container", () => {
    const events = [
      makeUserEvent("First prompt", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    const { container } = render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
      />
    );

    // Force showScrollDown state: simulate scrolling away from bottom
    // The button only renders when showScrollDown is true.
    // We can trigger it by simulating the scroll container not being at bottom.
    const scrollContainer = container.querySelector(".overflow-y-auto");
    expect(scrollContainer).not.toBeNull();

    // Define scrollHeight > scrollTop + clientHeight to trigger showScrollDown
    Object.defineProperty(scrollContainer!, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scrollContainer!, "scrollTop", { value: 0, configurable: true });
    Object.defineProperty(scrollContainer!, "clientHeight", { value: 500, configurable: true });
    fireEvent.scroll(scrollContainer!);

    // Now the "New turns" button should appear
    const newTurnsButton = screen.getByText(/new turns/i);
    expect(newTurnsButton).toBeTruthy();

    // The button's parent with "absolute" class should be inside a container with "relative"
    const absoluteDiv = newTurnsButton.closest(".absolute");
    expect(absoluteDiv).not.toBeNull();

    // The conversation panel (outermost div) must have position: relative
    // so absolute children are scoped to it, not the whole page
    const conversationPanel = absoluteDiv!.parentElement;
    expect(conversationPanel).not.toBeNull();
    const panelClasses = conversationPanel!.className;
    expect(panelClasses).toContain("relative");
  });
});

describe("ConversationView ProgressBar (per-turn)", () => {
  function makeAssistantWithTaskCreate(ts: number, desc: string): SessionEvent {
    return {
      type: "assistant",
      uuid: `asst-task-${ts}`,
      timestamp: new Date(ts).toISOString(),
      sessionId: "sess-1",
      message: {
        role: "assistant",
        model: "test",
        content: [
          { type: "tool_use", id: "tu1", name: "TaskCreate", input: { description: desc } },
        ],
      },
    } as unknown as SessionEvent;
  }

  it("renders ProgressBar inside the turn that has TaskCreate tool calls", () => {
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithTaskCreate(1, "Build feature"),
      makeAssistantWithTaskCreate(2, "Write tests"),
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
      />
    );

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toBeTruthy();
    expect(progressbar.getAttribute("aria-valuenow")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("2");
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
  });

  it("does not render ProgressBar when no task tool calls exist", () => {
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
      />
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

function makeAssistantWithToolUse(
  index: number,
  toolName: string,
  input: Record<string, unknown>,
): AssistantEvent {
  return {
    type: "assistant",
    uuid: `asst-tool-${index}`,
    timestamp: `2026-01-01T00:00:0${index}Z`,
    sessionId: "sess-1",
    agentId: "main",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: `tu-${index}`, name: toolName, input },
      ],
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "tool_use",
    },
  } as AssistantEvent;
}

describe("ConversationView TaskGrid derived from events", () => {
  it("derives tasks from TaskCreate tool_use events", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "TASK-001: Setup database" }),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "TASK-002: Write tests" }),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "TASK-003: Deploy" }),
    ];
    const turns = groupEventsIntoTurns(events);

    render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    const expandButton = screen.getByRole("button", { name: /3 tasks/i });
    expect(expandButton).toBeTruthy();
  });

  it("does not render TaskGrid when no task-related events exist", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events);

    render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    expect(screen.queryByRole("button", { name: /tasks.*click to expand/i })).toBeNull();
  });

  it("TaskUpdate flips status to done within same turn", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "Task A" }),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "Task B" }),
      makeAssistantWithToolUse(1, "TaskUpdate", { taskId: "1", status: "completed" }),
      makeAssistantWithToolUse(1, "TaskUpdate", { taskId: "2", status: "completed" }),
    ];
    const turns = groupEventsIntoTurns(events);

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    const expandButton = screen.getByRole("button", { name: /2 tasks/i });
    fireEvent.click(expandButton);

    const cells = container.querySelectorAll("td");
    const statusCells = Array.from(cells).filter((_, i) => i % 3 === 2);
    expect(statusCells).toHaveLength(2);
    statusCells.forEach((cell) => {
      expect(cell.textContent).toBe("\u2713");
    });
  });

  it("shows per-turn DELTA — latest turn lists only tasks it Created (Bug D)", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "Old task" }),
      makeUserEvent("Continue", 2),
      makeAssistantWithToolUse(3, "TaskCreate", { subject: "New task A" }),
      makeAssistantWithToolUse(3, "TaskCreate", { subject: "New task B" }),
    ];
    const turns = groupEventsIntoTurns(events);

    render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    // Per-turn delta: T3 created 2 tasks ("New task A" + "New task B"). "Old task"
    // belongs to T1's delta and must NOT bleed into T3's TaskGrid.
    const expandButton = screen.getByRole("button", { name: /2 tasks/i });
    expect(expandButton).toBeTruthy();
    // The earlier turn still renders its own single-task delta.
    expect(screen.getByRole("button", { name: /1 tasks/i })).toBeTruthy();
  });

  it("maps unknown TaskUpdate statuses to pending", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TaskCreate", { subject: "Mystery task" }),
      makeAssistantWithToolUse(1, "TaskUpdate", { taskId: "1", status: "unknown_status" }),
    ];
    const turns = groupEventsIntoTurns(events);

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    const expandButton = screen.getByRole("button", { name: /1 tasks/i });
    fireEvent.click(expandButton);

    const cells = container.querySelectorAll("td");
    const statusCells = Array.from(cells).filter((_, i) => i % 3 === 2);
    expect(statusCells[0].textContent).toBe("--");
  });
});

describe("ConversationView RewindMenu integration", () => {
  // Mock TanStack Router for RewindMenu internals
  vi.mock("@tanstack/react-router", () => ({
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    useParams: () => ({ repoSlug: "test-repo", sessionId: "sess-1" }),
  }));

  it("does not render RewindMenu by default", () => {
    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(<ConversationView events={events} turns={turns} metrics={null} sessionId="sess-1" />);

    expect(screen.queryByRole("dialog", { name: /rewind/i })).toBeNull();
  });

  it("shows a visible trigger button for RewindMenu", () => {
    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(<ConversationView events={events} turns={turns} metrics={null} sessionId="sess-1" />);

    const rewindButton = screen.getByRole("button", { name: /rewind/i });
    expect(rewindButton).toBeTruthy();
  });

  it("opens RewindMenu when the rewind trigger button is clicked", () => {
    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(<ConversationView events={events} turns={turns} metrics={null} sessionId="sess-1" />);

    const rewindButton = screen.getByRole("button", { name: /rewind/i });
    fireEvent.click(rewindButton);

    expect(screen.getByRole("dialog", { name: /rewind/i })).toBeTruthy();
  });

  it("closes RewindMenu when onClose is called", () => {
    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(<ConversationView events={events} turns={turns} metrics={null} sessionId="sess-1" />);

    // Open the menu
    const rewindButton = screen.getByRole("button", { name: /rewind/i });
    fireEvent.click(rewindButton);
    expect(screen.getByRole("dialog", { name: /rewind/i })).toBeTruthy();

    // Close via the X button inside the dialog
    const closeButton = screen.getByRole("button", { name: /close rewind/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: /rewind/i })).toBeNull();
  });
});

describe("ConversationView handleClear fetch guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("non-2xx on /sessions/new does NOT call onSessionStarted with a bad id", async () => {
    const onSessionStarted = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ sessionId: "bad-id-from-error-body" }),
      })
    );

    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        sessionCwd="/tmp/test-cwd"
        onSessionStarted={onSessionStarted}
      />
    );

    // Trigger handleClear via Ctrl+L keyboard shortcut
    fireEvent.keyDown(document, { key: "l", ctrlKey: true });

    // Wait for async handleClear to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(onSessionStarted).not.toHaveBeenCalledWith("bad-id-from-error-body");
  });

  it("2xx on /sessions/new DOES call onSessionStarted with the returned id", async () => {
    const onSessionStarted = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ sessionId: "good-session-id" }),
      })
    );

    const events = [makeUserEvent("Prompt", 0), makeAssistantEvent(1)];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        sessionCwd="/tmp/test-cwd"
        onSessionStarted={onSessionStarted}
      />
    );

    // Trigger handleClear via Ctrl+L keyboard shortcut
    fireEvent.keyDown(document, { key: "l", ctrlKey: true });

    // Wait for async handleClear to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(onSessionStarted).toHaveBeenCalledWith("good-session-id");
  });
});

describe("ConversationView onDecideSession", () => {
  function makePermission(overrides?: Partial<PermissionRequest>): PermissionRequest {
    return {
      id: "perm-1",
      sessionId: "sess-1",
      agentId: "main",
      toolName: "Bash",
      input: { command: "echo hello" },
      timestamp: "2026-01-01T00:00:01Z",
      status: "pending",
      ...overrides,
    };
  }

  it("passes onDecideSession to PermissionBlock and clicking 'Allow for session' calls it", () => {
    const onDecideSession = vi.fn();
    const onPermissionDecide = vi.fn();
    const permission = makePermission();
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        permissions={[permission]}
        onPermissionDecide={onPermissionDecide}
        onDecideSession={onDecideSession}
      />
    );

    const sessionBtn = screen.getByRole("button", { name: /allow.*for.*session/i });
    fireEvent.click(sessionBtn);

    expect(onDecideSession).toHaveBeenCalledWith("perm-1");
    expect(onPermissionDecide).not.toHaveBeenCalled();
  });

  it("does not render 'Allow for session' button when onDecideSession is not provided", () => {
    const onPermissionDecide = vi.fn();
    const permission = makePermission();
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];

    const turns = groupEventsIntoTurns(events as SessionEvent[]);
    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        permissions={[permission]}
        onPermissionDecide={onPermissionDecide}
      />
    );

    expect(screen.queryByRole("button", { name: /allow.*for.*session/i })).toBeNull();
  });
});

describe("ConversationView sessionIsRunning fallback to isRunning", () => {
  it("renders last turn as indeterminate when session is active-recent but not running", () => {
    // Reproduces bug filed 2026-05-16: last turn renders "Generating..." forever on
    // sessions where mtime is within the 12-hour active window (isActive=true) but
    // the daemon is idle and the file has not been written in >2 minutes
    // (isRunning=false). The last assistant message lacks `end_turn`, so
    // `isAgentCompleted("main", …)` returns false. The fallback in
    // ConversationView must read `isRunning` (daemon-status-aware), not `isActive`
    // (12-hour mtime), so `getAgentStatus` returns `"indeterminate"` instead of
    // `"running"`.
    const events: SessionEvent[] = [
      makeUserEvent("Run a long command", 0),
      {
        type: "assistant",
        uuid: "asst-no-end-turn",
        timestamp: "2026-01-01T00:00:01Z",
        sessionId: "sess-1",
        agentId: "main",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-bash", name: "Bash", input: { command: "sleep 300" } }],
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "tool_use",
        },
      } as unknown as SessionEvent,
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    const metrics = {
      session: {
        id: "sess-1",
        projectHash: "ph1",
        path: "/p",
        startTime: "2026-01-01T00:00:00Z",
        lastModified: "2026-01-01T00:00:01Z",
        eventCount: 2,
        subagentCount: 0,
        isActive: true,
        isRunning: false,
      },
    } as unknown as import("../../lib/types").SessionMetrics;

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={metrics} />
    );

    // The last turn's completion indicator must reflect indeterminate state
    // (grey dot, no timer) — NOT a pulsing "Generating..." amber dot.
    const indicators = container.querySelectorAll('[data-testid="turn-completion-indicator"]');
    expect(indicators.length).toBeGreaterThan(0);
    const lastIndicator = indicators[indicators.length - 1];
    expect(lastIndicator.getAttribute("data-status")).toBe("indeterminate");
    expect(lastIndicator.textContent ?? "").toContain("Session ended without completion");
    expect(lastIndicator.textContent ?? "").not.toContain("Generating...");
  });
});

describe("ConversationView static compact_boundary markers (FU-4)", () => {
  it("renders an inline compact marker between the two surrounding turns in a replayed session", () => {
    const events: SessionEvent[] = [
      makeUserEvent("first prompt", 0),
      makeAssistantEvent(1),
      // compact_boundary sits between turn 1's response and turn 2's prompt
      {
        type: "system",
        uuid: "compact-1",
        timestamp: "2026-01-01T00:00:02Z",
        sessionId: "sess-1",
        subtype: "compact_boundary",
        // camelCase compactMetadata — real CC v2.1.143 JSONL shape (P1-5)
        compactMetadata: {
          trigger: "auto",
          preTokens: 168000,
          postTokens: 9000,
          durationMs: 60800,
        },
      } as unknown as SessionEvent,
      makeUserEvent("second prompt", 3),
      makeAssistantEvent(4),
    ];

    const turns = groupEventsIntoTurns(events);
    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />,
    );

    const markers = container.querySelectorAll('[data-testid="static-compact-marker"]');
    expect(markers).toHaveLength(1);
    const text = markers[0].textContent ?? "";
    expect(text).toContain("auto-compacted");
    expect(text).toContain("turn 1");
    expect(text).toContain("168,000");
    expect(text).toContain("9,000");
  });

  it("renders nothing extra when no compact_boundary events exist", () => {
    const events: SessionEvent[] = [
      makeUserEvent("a", 0),
      makeAssistantEvent(1),
      makeUserEvent("b", 2),
      makeAssistantEvent(3),
    ];
    const turns = groupEventsIntoTurns(events);
    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />,
    );
    expect(container.querySelectorAll('[data-testid="static-compact-marker"]')).toHaveLength(0);
  });
});

describe("ConversationView auto-denial markers (NEW-9)", () => {
  it("renders an AutoDenialBlock inline when a system.permission_denied event sits in a turn", () => {
    const events: SessionEvent[] = [
      makeUserEvent("first prompt", 0),
      makeAssistantEvent(1),
      {
        type: "system",
        uuid: "denial-1",
        timestamp: "2026-01-01T00:00:02Z",
        sessionId: "sess-1",
        subtype: "permission_denied",
        tool_name: "Bash",
        tool_use_id: "toolu_blocked_1",
        decision_reason_type: "classifier",
        decision_reason: "auto-mode flagged risky command",
        message: "Tool call blocked by classifier",
      } as unknown as SessionEvent,
      makeUserEvent("second prompt", 3),
      makeAssistantEvent(4),
    ];

    const turns = groupEventsIntoTurns(events);
    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />,
    );

    const blocks = container.querySelectorAll('[data-testid="auto-denial-block"]');
    expect(blocks).toHaveLength(1);
    const text = blocks[0].textContent ?? "";
    expect(text).toContain("Bash");
    expect(text).toContain("classifier");
    expect(text).toContain("Tool call blocked by classifier");
  });

  it("renders nothing extra when no permission_denied events exist", () => {
    const events: SessionEvent[] = [
      makeUserEvent("a", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events);
    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />,
    );
    expect(container.querySelectorAll('[data-testid="auto-denial-block"]')).toHaveLength(0);
  });
});
