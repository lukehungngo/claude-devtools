import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RawLogView } from "./RawLogView";
import type { AssistantEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

afterEach(cleanup);

function makeEvent(uuid: string, ts: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello world" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message" as const,
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  } as AssistantEvent;
}

function makeTurn(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "Hello",
    startIndex: 0,
    endIndex: 2,
    agents: [],
    durationMs: 1000,
    cost: 0.001,
    costBreakdown: { total: 0.001, inputCost: 0.0005, outputCost: 0.0005 },
    inputTokens: 0,
    outputTokens: 0,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:01.000Z",
    dispatchedAgentIds: new Set<string>(["main"]),
    ...overrides,
  };
}

describe("RawLogView", () => {
  it("shows empty state when activeTurnIndex is null", () => {
    render(
      <RawLogView turns={[makeTurn()]} allEvents={[makeEvent("e1", "2026-01-01T00:00:00.123Z")]} activeTurnIndex={null} />,
    );
    expect(screen.getByText("Select a turn to view raw events")).toBeTruthy();
  });

  it("renders events for a selected turn", () => {
    const ts1 = "2026-01-01T00:00:00.123Z";
    const ts2 = "2026-01-01T00:00:01.456Z";

    function localTimeStr(ts: string): string {
      const d = new Date(ts);
      return (
        `${String(d.getHours()).padStart(2, "0")}:` +
        `${String(d.getMinutes()).padStart(2, "0")}:` +
        `${String(d.getSeconds()).padStart(2, "0")}.` +
        String(d.getMilliseconds()).padStart(3, "0")
      );
    }

    const events = [makeEvent("e1", ts1), makeEvent("e2", ts2)];
    const turn = makeTurn({ startIndex: 0, endIndex: 2 });

    render(
      <RawLogView turns={[turn]} allEvents={events} activeTurnIndex={0} />,
    );

    // Timestamps rendered in local time (not UTC)
    expect(screen.getByText(localTimeStr(ts1))).toBeTruthy();
    expect(screen.getByText(localTimeStr(ts2))).toBeTruthy();

    // Should render event type badges
    const badges = screen.getAllByText("assistant");
    expect(badges.length).toBe(2);
  });
});
