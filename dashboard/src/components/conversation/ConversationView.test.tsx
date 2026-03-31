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
