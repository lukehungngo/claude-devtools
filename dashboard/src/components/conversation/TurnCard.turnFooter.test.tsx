/**
 * Regression: turn footer must show "Generating..." (not "Completed") when
 * main agent end_turn fires but Agent dispatches in the turn have no
 * task-notification yet. See docs/bugs/synthetic-agent-instant-completion.md.
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TurnCard } from "./TurnCard";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, UserEvent, QueueOperationEvent } from "../../lib/types";

beforeAll(() => {
  // jsdom lacks IntersectionObserver
  if (typeof globalThis.IntersectionObserver === "undefined") {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      class { observe() {} unobserve() {} disconnect() {} } as unknown;
  }
});

afterEach(() => cleanup());

const T_ID = "toolu_async_1";
const DISPATCH_TS = "2026-05-16T21:00:00.000Z";
const ACK_TS = "2026-05-16T21:00:00.400Z";
const NOTIF_TS = "2026-05-16T21:06:30.000Z";

function dispatchAssistant(): AssistantEvent {
  return {
    type: "assistant",
    uuid: "asst-dispatch",
    timestamp: DISPATCH_TS,
    sessionId: "s1",
    message: {
      role: "assistant",
      model: "claude-opus-4-7",
      id: "msg-dispatch",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{
        type: "tool_use",
        id: T_ID,
        name: "Agent",
        input: { description: "do thing", subagent_type: "engineer", run_in_background: true },
      }],
    },
  } as unknown as AssistantEvent;
}

function ackToolResult(): UserEvent {
  return {
    type: "user",
    uuid: "user-ack",
    timestamp: ACK_TS,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: T_ID,
        content: [{ type: "text", text: "Async agent launched successfully.\nagentId: abc" }],
        is_error: false,
      }],
    },
  } as unknown as UserEvent;
}

function notification(): QueueOperationEvent {
  return {
    type: "queue-operation",
    uuid: "q-notif",
    timestamp: NOTIF_TS,
    sessionId: "s1",
    operation: "enqueue",
    content: `<task-notification>\n<task-id>abc</task-id>\n<tool-use-id>${T_ID}</tool-use-id>\n</task-notification>`,
  } as unknown as QueueOperationEvent;
}

function snapshot(events: SessionEvent[]): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "",
    startIndex: 0,
    endIndex: events.length,
    agents: [],
    durationMs: null,
    cost: 0,
    costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    startTime: DISPATCH_TS,
    endTime: undefined,
    model: "claude-opus-4-7",
  } as unknown as TurnSnapshot;
}

describe("TurnFooter — async-dispatch completion gating", () => {
  it("Live session + dispatch + ack only → footer reads 'Generating' (NOT 'Completed')", () => {
    const events: SessionEvent[] = [dispatchAssistant(), ackToolResult()];
    render(
      <TurnCard
        turn={snapshot(events)}
        allEvents={events}
        sessionIsRunning={true}
      />,
    );
    const indicator = screen.getByTestId("turn-completion-indicator");
    expect(indicator.getAttribute("data-status")).toBe("running");
    expect(indicator.textContent).toMatch(/generating/i);
    expect(indicator.textContent).not.toMatch(/completed in/i);
  });

  it("Live session + dispatch + ack + task-notification → footer reads 'Completed'", () => {
    const events: SessionEvent[] = [dispatchAssistant(), ackToolResult(), notification()];
    render(
      <TurnCard
        turn={snapshot(events)}
        allEvents={events}
        sessionIsRunning={true}
      />,
    );
    const indicator = screen.getByTestId("turn-completion-indicator");
    expect(indicator.getAttribute("data-status")).toBe("completed");
    expect(indicator.textContent).toMatch(/completed/i);
  });

  it("Closed session + dispatch + ack only → footer reverts to main status (no forever-Generating)", () => {
    const events: SessionEvent[] = [dispatchAssistant(), ackToolResult()];
    render(
      <TurnCard
        turn={snapshot(events)}
        allEvents={events}
        sessionIsRunning={false}
      />,
    );
    const indicator = screen.getByTestId("turn-completion-indicator");
    // main agent saw end_turn → main is completed; without live signal we
    // don't force "running", so this falls through to main's status.
    expect(indicator.getAttribute("data-status")).toBe("completed");
  });
});
