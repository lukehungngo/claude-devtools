import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RawLogTab } from "./RawLogTab";
import type { SessionEvent, AssistantEvent, UserEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

afterEach(cleanup);

function makeEvent(
  overrides: Partial<SessionEvent> & { type: SessionEvent["type"] },
): SessionEvent {
  const base = {
    uuid: crypto.randomUUID(),
    timestamp: "2026-03-31T10:00:00.123Z",
    sessionId: "sess-1",
    ...overrides,
  };
  if (base.type === "assistant") {
    return {
      ...base,
      type: "assistant",
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello world" }],
        model: "claude-sonnet-4-20250514",
        id: "msg-1",
        type: "message" as const,
        stop_reason: "end_turn" as const,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    } as AssistantEvent;
  }
  if (base.type === "user") {
    return {
      ...base,
      type: "user",
      userType: "external",
      message: {
        role: "user" as const,
        content: "test prompt",
      },
    } as UserEvent;
  }
  if (base.type === "system") {
    return {
      ...base,
      type: "system",
      subtype: "init",
    } as SessionEvent;
  }
  return base as SessionEvent;
}

function makeTurn(partial: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "test",
    startIndex: 0,
    endIndex: 2,
    agents: [],
    status: "completed",
    durationMs: 1000,
    cost: 0.001,
    costBreakdown: { total: 0.001, tokensIn: 0.0005, tokensOut: 0.0005 },
    startTime: "2026-03-31T10:00:00.000Z",
    completedAt: "2026-03-31T10:00:01.000Z",
    endTime: "2026-03-31T10:00:01.000Z",
    ...partial,
  };
}

const defaultProps = {
  turns: [] as TurnSnapshot[],
  allEvents: [] as SessionEvent[],
  activeTurnIndex: null,
  events: [] as SessionEvent[],
  liveEvents: [] as SessionEvent[],
  isLive: false,
};

describe("RawLogTab", () => {
  it("renders Events mode by default with pill toggle", () => {
    const events = [makeEvent({ type: "assistant" })];
    render(<RawLogTab {...defaultProps} events={events} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);

    const eventsBtn = screen.getByText("Events");
    const jsonBtn = screen.getByText("JSON");
    expect(eventsBtn.closest("button")?.className).toContain("active");
    expect(jsonBtn.closest("button")?.className).not.toContain("active");
  });

  it("switches to JSON mode on click", () => {
    const ev = makeEvent({ type: "user" });
    const turn = makeTurn({ startIndex: 0, endIndex: 1 });
    render(
      <RawLogTab
        {...defaultProps}
        turns={[turn]}
        allEvents={[ev]}
        activeTurnIndex={0}
        events={[ev]}
      />,
    );

    const jsonBtn = screen.getByText("JSON");
    fireEvent.click(jsonBtn);

    expect(jsonBtn.closest("button")?.className).toContain("active");
    // JSON mode should show raw event rows
    expect(
      screen.getAllByTestId("raw-event-row").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("Events mode: clicking row expands JSON accordion", () => {
    const ev = makeEvent({ type: "assistant" });
    render(<RawLogTab {...defaultProps} events={[ev]} allEvents={[ev]} />);

    const row = screen.getByTestId("event-row");
    // Initially collapsed
    expect(row.textContent).toContain("\u25b6");
    expect(screen.queryByTestId("row-json-expand")).toBeNull();

    fireEvent.click(row);

    // Now expanded
    expect(row.textContent).toContain("\u25bc");
    expect(screen.getByTestId("row-json-expand")).toBeTruthy();
  });

  it("Events mode: clicking expanded row collapses it", () => {
    const ev = makeEvent({ type: "assistant" });
    render(<RawLogTab {...defaultProps} events={[ev]} allEvents={[ev]} />);

    const row = screen.getByTestId("event-row");
    // Expand
    fireEvent.click(row);
    expect(screen.getByTestId("row-json-expand")).toBeTruthy();

    // Collapse
    fireEvent.click(row);
    expect(row.textContent).toContain("\u25b6");
    expect(screen.queryByTestId("row-json-expand")).toBeNull();
  });

  it("shows empty state in Events mode", () => {
    render(<RawLogTab {...defaultProps} />);

    expect(screen.getByText("Waiting for events...")).toBeTruthy();
  });

  it("JSON mode: shows select turn message when no activeTurnIndex", () => {
    render(<RawLogTab {...defaultProps} />);

    const jsonBtn = screen.getByText("JSON");
    fireEvent.click(jsonBtn);

    expect(
      screen.getByText("Select a turn to see raw events"),
    ).toBeTruthy();
  });

  it("pill toggle shows live dot when isLive", () => {
    const ev = makeEvent({ type: "assistant" });
    render(<RawLogTab {...defaultProps} events={[ev]} isLive />);

    // The Events button should contain the live dot indicator
    const eventsBtn = screen.getByRole("button", { name: /Events/ });
    expect(eventsBtn.textContent).toContain("\u25cf");
  });

  describe("EventsMode turn grouping", () => {
    function makeGroupedProps() {
      const initEvent = makeEvent({ type: "system", timestamp: "2026-03-31T10:00:00.000Z" });
      const userEvent1 = makeEvent({
        type: "user",
        timestamp: "2026-03-31T10:00:01.000Z",
      });
      const assistantEvent1 = makeEvent({
        type: "assistant",
        timestamp: "2026-03-31T10:00:02.000Z",
      });
      const userEvent2 = makeEvent({
        type: "user",
        timestamp: "2026-03-31T10:01:00.000Z",
      });
      const assistantEvent2 = makeEvent({
        type: "assistant",
        timestamp: "2026-03-31T10:01:01.000Z",
      });

      const allEvents = [initEvent, userEvent1, assistantEvent1, userEvent2, assistantEvent2];
      const turn1 = makeTurn({ turnNumber: 1, startIndex: 1, endIndex: 3, startTime: "2026-03-31T10:00:01.000Z" });
      const turn2 = makeTurn({ turnNumber: 2, startIndex: 3, endIndex: 5, startTime: "2026-03-31T10:01:00.000Z" });

      return {
        ...defaultProps,
        allEvents,
        events: allEvents,
        turns: [turn1, turn2],
        activeTurnIndex: null,
      };
    }

    it("renders turn group headers with event counts", () => {
      const props = makeGroupedProps();
      render(<RawLogTab {...props} />);

      const headers = screen.getAllByTestId("turn-group-header");
      expect(headers).toHaveLength(2);
      expect(headers[0].textContent).toContain("Turn 1");
      expect(headers[0].textContent).toContain("2 events");
      expect(headers[1].textContent).toContain("Turn 2");
      expect(headers[1].textContent).toContain("2 events");
    });

    it("renders init group for events before first turn", () => {
      const props = makeGroupedProps();
      render(<RawLogTab {...props} />);

      const initGroup = screen.getByTestId("init-group");
      expect(initGroup).toBeTruthy();
      // Init group should contain event rows for the system init event
      const initRows = initGroup.querySelectorAll('[data-testid="event-row"]');
      expect(initRows).toHaveLength(1);
    });

    it("latest turn expanded by default, older turns collapsed", () => {
      const props = makeGroupedProps();
      render(<RawLogTab {...props} />);

      // Turn 1 should be collapsed (no event rows visible)
      const turn1Region = screen.queryByTestId("turn-group-1");
      expect(turn1Region).toBeNull();

      // Turn 2 (latest) should be expanded
      const turn2Region = screen.getByTestId("turn-group-2");
      expect(turn2Region).toBeTruthy();
      const turn2Rows = turn2Region.querySelectorAll('[data-testid="event-row"]');
      expect(turn2Rows.length).toBeGreaterThan(0);
    });

    it("clicking header toggles expand/collapse of turn group", () => {
      const props = makeGroupedProps();
      render(<RawLogTab {...props} />);

      const headers = screen.getAllByTestId("turn-group-header");

      // Turn 1 is collapsed by default; click to expand
      fireEvent.click(headers[0]);
      const turn1Region = screen.getByTestId("turn-group-1");
      expect(turn1Region).toBeTruthy();

      // Click again to collapse
      fireEvent.click(headers[0]);
      expect(screen.queryByTestId("turn-group-1")).toBeNull();
    });

    it("active turn auto-expands when activeTurnIndex changes", () => {
      const props = makeGroupedProps();
      const { rerender } = render(<RawLogTab {...props} />);

      // Turn 1 is collapsed by default
      expect(screen.queryByTestId("turn-group-1")).toBeNull();

      // Set activeTurnIndex to 0 (Turn 1)
      rerender(<RawLogTab {...props} activeTurnIndex={0} />);

      // Turn 1 should now be expanded
      const turn1Region = screen.getByTestId("turn-group-1");
      expect(turn1Region).toBeTruthy();
    });

    it("turn group headers have aria-expanded attribute", () => {
      const props = makeGroupedProps();
      render(<RawLogTab {...props} />);

      const headers = screen.getAllByTestId("turn-group-header");
      // Turn 1 collapsed
      expect(headers[0].getAttribute("aria-expanded")).toBe("false");
      // Turn 2 expanded (latest)
      expect(headers[1].getAttribute("aria-expanded")).toBe("true");
    });

    it("session with no turns shows all events in init group", () => {
      const ev = makeEvent({ type: "system" });
      render(<RawLogTab {...defaultProps} events={[ev]} allEvents={[ev]} turns={[]} />);

      const initGroup = screen.getByTestId("init-group");
      expect(initGroup).toBeTruthy();
      const rows = initGroup.querySelectorAll('[data-testid="event-row"]');
      expect(rows).toHaveLength(1);
    });
  });
});
