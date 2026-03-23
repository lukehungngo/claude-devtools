/**
 * Tests for ConversationView bidirectional turn sync (TASK-004)
 *
 * Verifies that onTurnClick is called with the correct unfiltered turn index
 * when a turn's outer container is clicked.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ConversationView } from "./ConversationView";
import type { UserEvent, AssistantEvent } from "../../lib/types";

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

    const { container } = render(
      <ConversationView
        events={events}
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

    const { container } = render(
      <ConversationView
        events={events}
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
