import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent } from "../../lib/types";
import { RawTab } from "./RawTab";

const mockEvent: AssistantEvent = {
  type: "assistant",
  uuid: "evt-1",
  timestamp: "2026-03-30T14:30:00Z",
  sessionId: "sess-1",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "Hello world response" }],
    model: "claude-sonnet-4-6",
    id: "msg-1",
    type: "message",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
  },
};

const mockEvent2: SessionEvent = {
  type: "user",
  uuid: "evt-2",
  timestamp: "2026-03-30T14:31:00Z",
  sessionId: "sess-1",
  userType: "external",
  message: {
    role: "user",
    content: [{ type: "text", text: "Follow up question" }],
  },
};

const mockAllEvents: SessionEvent[] = [mockEvent, mockEvent2];

const mockTurn: TurnSnapshot = {
  turnNumber: 1,
  promptText: "hello",
  startIndex: 0,
  endIndex: 2,
  agents: [],
  status: "completed",
  durationMs: 1000,
  cost: 0.5,
  costBreakdown: { total: 0.5, tokensIn: 0.3, tokensOut: 0.2 },
  startTime: "2026-03-30T14:30:00Z",
  completedAt: "2026-03-30T14:31:00Z",
  endTime: "2026-03-30T14:31:00Z",
};

describe("RawTab", () => {
  afterEach(cleanup);

  it("renders empty state with null activeTurnIndex", () => {
    render(<RawTab turns={[]} allEvents={[]} activeTurnIndex={null} />);
    expect(screen.getByText("Select a turn to see raw events")).toBeDefined();
  });

  it("renders empty state when activeTurnIndex is out of bounds", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={5} />);
    expect(screen.getByText("Select a turn to see raw events")).toBeDefined();
  });

  it("renders event list when turn has events", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={0} />);
    // Should render rows for both events
    const rows = screen.getAllByTestId("raw-event-row");
    expect(rows.length).toBe(2);
  });

  it("shows event type and timestamp in summary rows", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={0} />);
    const rows = screen.getAllByTestId("raw-event-row");
    expect(rows[0].textContent).toContain("assistant");
    expect(rows[1].textContent).toContain("user");
  });

  it("expanding an event shows JSON content", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={0} />);
    const rows = screen.getAllByTestId("raw-event-row");
    fireEvent.click(rows[0]);
    const jsonArea = screen.getByTestId("raw-json-view");
    expect(jsonArea).toBeDefined();
    // Should contain the event's uuid in the JSON
    expect(jsonArea.textContent).toContain("evt-1");
  });

  it("clicking a different event switches the JSON view", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={0} />);
    const rows = screen.getAllByTestId("raw-event-row");
    fireEvent.click(rows[0]);
    expect(screen.getByTestId("raw-json-view").textContent).toContain("evt-1");
    fireEvent.click(rows[1]);
    expect(screen.getByTestId("raw-json-view").textContent).toContain("evt-2");
  });

  it("clicking the same event again deselects it", () => {
    render(<RawTab turns={[mockTurn]} allEvents={mockAllEvents} activeTurnIndex={0} />);
    const rows = screen.getAllByTestId("raw-event-row");
    fireEvent.click(rows[0]);
    expect(screen.getByTestId("raw-json-view")).toBeDefined();
    fireEvent.click(rows[0]);
    expect(screen.queryByTestId("raw-json-view")).toBeNull();
  });
});
