import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { TaskPanel } from "../TaskPanel";
import type { SessionEvent, AssistantEvent } from "../../../lib/types";

afterEach(cleanup);

function makeAssistantEvent(
  toolUses: Array<{ name: string; input: Record<string, unknown> }>,
): AssistantEvent {
  return {
    type: "assistant",
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: toolUses.map((tu) => ({
        type: "tool_use" as const,
        id: `id-${Math.random().toString(36).slice(2)}`,
        name: tu.name,
        input: tu.input,
      })),
      model: "claude-sonnet-4-6",
      id: "msg-123",
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

describe("TaskPanel", () => {
  it("renders empty state when no events", () => {
    render(<TaskPanel events={[]} />);
    expect(screen.getByText(/No tasks/)).toBeTruthy();
  });

  it("renders empty state when no TodoWrite events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([{ name: "Read", input: {} }]),
    ];
    render(<TaskPanel events={events} />);
    expect(screen.getByText(/No tasks/)).toBeTruthy();
  });

  it("renders tasks from TodoWrite events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Fix parsing bug", status: "completed" },
              { id: "2", title: "Write tests", status: "in_progress" },
              { id: "3", title: "Deploy to prod", status: "pending" },
            ],
          },
        },
      ]),
    ];

    render(<TaskPanel events={events} />);
    expect(screen.getByText("Fix parsing bug")).toBeTruthy();
    expect(screen.getByText("Write tests")).toBeTruthy();
    expect(screen.getByText("Deploy to prod")).toBeTruthy();
  });

  it("sorts tasks: in_progress first, then pending, then completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Completed task", status: "completed" },
              { id: "2", title: "Pending task", status: "pending" },
              { id: "3", title: "Active task", status: "in_progress" },
            ],
          },
        },
      ]),
    ];

    render(<TaskPanel events={events} />);
    const titles = screen.getAllByTestId("task-title").map((el) => el.textContent);
    expect(titles).toEqual(["Active task", "Pending task", "Completed task"]);
  });

  it("displays status badges", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Task A", status: "in_progress" },
              { id: "2", title: "Task B", status: "completed" },
              { id: "3", title: "Task C", status: "pending" },
            ],
          },
        },
      ]),
    ];

    render(<TaskPanel events={events} />);
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.getByText("todo")).toBeTruthy();
  });

  it("shows description when available", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Task", status: "pending", description: "Detailed info here" },
            ],
          },
        },
      ]),
    ];

    render(<TaskPanel events={events} />);
    expect(screen.getByText("Detailed info here")).toBeTruthy();
  });

  it("shows progress summary", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "A", status: "completed" },
              { id: "2", title: "B", status: "completed" },
              { id: "3", title: "C", status: "pending" },
            ],
          },
        },
      ]),
    ];

    render(<TaskPanel events={events} />);
    expect(screen.getByText(/2.*\/.*3/)).toBeTruthy();
  });
});
