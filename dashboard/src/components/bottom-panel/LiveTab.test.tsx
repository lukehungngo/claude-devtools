import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LiveTab } from "./LiveTab";
import type { SessionEvent, AssistantEvent, UserEvent, SystemEvent, ProgressEvent } from "../../lib/types";

function makeAssistantEvent(ts: string, text: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

function makeUserEvent(ts: string, text: string): UserEvent {
  return {
    type: "user",
    uuid: `u-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: text,
    },
  };
}

function makeSystemEvent(ts: string, subtype: string): SystemEvent {
  return {
    type: "system",
    uuid: `sys-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    subtype,
  };
}

function makeProgressEvent(ts: string): ProgressEvent {
  return {
    type: "progress",
    uuid: `p-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    data: { type: "tool_start" },
  };
}

describe("LiveTab", () => {
  afterEach(cleanup);

  it("renders empty state with no events", () => {
    render(<LiveTab events={[]} liveEvents={[]} />);
    expect(screen.getByText("Waiting for events...")).toBeDefined();
  });

  it("renders event rows with correct type badges", () => {
    const events: SessionEvent[] = [
      makeUserEvent("2026-01-01T10:00:00.123Z", "hello world"),
      makeAssistantEvent("2026-01-01T10:00:01.456Z", "hi there"),
      makeSystemEvent("2026-01-01T10:00:02.789Z", "init"),
      makeProgressEvent("2026-01-01T10:00:03.000Z"),
    ];
    render(<LiveTab events={events} liveEvents={[]} />);

    expect(screen.getByText("user")).toBeDefined();
    expect(screen.getByText("assistant")).toBeDefined();
    expect(screen.getByText("system")).toBeDefined();
    expect(screen.getByText("progress")).toBeDefined();
  });

  it("shows last 100 events when given more", () => {
    const events: SessionEvent[] = Array.from({ length: 120 }, (_, i) =>
      makeUserEvent(`2026-01-01T10:00:${String(i).padStart(2, "0")}.000Z`, `msg ${i}`),
    );
    const { container } = render(<LiveTab events={events} liveEvents={[]} />);
    // Should render exactly 100 rows
    const rows = container.querySelectorAll("[data-testid='event-row']");
    expect(rows.length).toBe(100);
  });

  it("combines events and liveEvents", () => {
    const events: SessionEvent[] = [
      makeUserEvent("2026-01-01T10:00:00.000Z", "first"),
    ];
    const liveEvents: SessionEvent[] = [
      makeAssistantEvent("2026-01-01T10:00:01.000Z", "second"),
    ];
    render(<LiveTab events={events} liveEvents={liveEvents} />);

    expect(screen.getByText("user")).toBeDefined();
    expect(screen.getByText("assistant")).toBeDefined();
  });

  it("shows summary text truncated from event content", () => {
    const longText = "A".repeat(120);
    const events: SessionEvent[] = [
      makeAssistantEvent("2026-01-01T10:00:00.000Z", longText),
    ];
    render(<LiveTab events={events} liveEvents={[]} />);
    // Should contain truncated text (80 chars)
    const summary = screen.getByText("A".repeat(80) + "...");
    expect(summary).toBeDefined();
  });
});
