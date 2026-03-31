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

describe("ConversationView ProgressBar", () => {
  function makeMetricsWithTasks(tasks: { total: number; completed: number; inProgress: number; pending: number }) {
    return {
      session: { id: "sess-1", projectPath: "/tmp", model: "test", startTime: "", cwd: "/tmp" },
      dag: { nodes: [], edges: [] },
      tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
      tokensByModel: {},
      tokensByTurn: [],
      tools: [],
      totalEvents: 0,
      totalToolCalls: 0,
      totalAgents: 0,
      models: [],
      duration: 0,
      contextPercent: 0,
      contextWindowSize: 200000,
      tasks,
      hasRemoteControl: false,
    } as unknown as import("../../lib/types").SessionMetrics;
  }

  it("renders ProgressBar when metrics.tasks.total > 0", () => {
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={makeMetricsWithTasks({ total: 5, completed: 2, inProgress: 1, pending: 2 })}
      />
    );

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toBeTruthy();
    expect(progressbar.getAttribute("aria-valuenow")).toBe("2");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("5");
    expect(screen.getByText("2/5")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
  });

  it("does not render ProgressBar when metrics is null", () => {
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

  it("does not render ProgressBar when tasks.total is 0", () => {
    const events = [
      makeUserEvent("Prompt", 0),
      makeAssistantEvent(1),
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={makeMetricsWithTasks({ total: 0, completed: 0, inProgress: 0, pending: 0 })}
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
  it("derives tasks from TodoWrite tool_use events", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TodoWrite", {
        todos: [
          { content: "Setup database", status: "completed" },
          { content: "Write tests", status: "in_progress" },
          { content: "Deploy", status: "pending" },
        ],
      }),
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

  it("maps completed and done statuses to done", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TodoWrite", {
        todos: [
          { content: "Task A", status: "completed" },
          { content: "Task B", status: "done" },
        ],
      }),
    ];
    const turns = groupEventsIntoTurns(events);

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    // Expand the task grid to verify status rendering
    const expandButton = screen.getByRole("button", { name: /2 tasks/i });
    fireEvent.click(expandButton);

    // Both should show the done checkmark
    const cells = container.querySelectorAll("td");
    // Status cells are at indices 2, 5 (every 3rd cell starting from index 2)
    const statusCells = Array.from(cells).filter((_, i) => i % 3 === 2);
    expect(statusCells).toHaveLength(2);
    // Both should have the checkmark character
    statusCells.forEach((cell) => {
      expect(cell.textContent).toBe("\u2713");
    });
  });

  it("uses the last TodoWrite event when multiple exist", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TodoWrite", {
        todos: [
          { content: "Old task", status: "pending" },
        ],
      }),
      makeUserEvent("Continue", 2),
      makeAssistantWithToolUse(3, "TodoWrite", {
        todos: [
          { content: "New task A", status: "done" },
          { content: "New task B", status: "in_progress" },
        ],
      }),
    ];
    const turns = groupEventsIntoTurns(events);

    render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    // Should show 2 tasks from the latest TodoWrite, not 1 from the first
    const expandButton = screen.getByRole("button", { name: /2 tasks/i });
    expect(expandButton).toBeTruthy();
  });

  it("maps unknown statuses to pending", () => {
    const events: SessionEvent[] = [
      makeUserEvent("Prompt", 0),
      makeAssistantWithToolUse(1, "TodoWrite", {
        todos: [
          { content: "Mystery task", status: "unknown_status" },
        ],
      }),
    ];
    const turns = groupEventsIntoTurns(events);

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={null} />
    );

    const expandButton = screen.getByRole("button", { name: /1 tasks/i });
    fireEvent.click(expandButton);

    // Unknown status should map to pending (-- indicator)
    const cells = container.querySelectorAll("td");
    const statusCells = Array.from(cells).filter((_, i) => i % 3 === 2);
    expect(statusCells[0].textContent).toBe("--");
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
