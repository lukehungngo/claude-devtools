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
    render(<RawLogTab {...defaultProps} events={[ev]} />);

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
    render(<RawLogTab {...defaultProps} events={[ev]} />);

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
});
