import { describe, it, expect } from "vitest";
import { extractTasks, type TodoTask } from "./extractTasks";
import type { SessionEvent, AssistantEvent } from "./types";

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

describe("extractTasks", () => {
  it("returns empty array when no events", () => {
    expect(extractTasks([])).toEqual([]);
  });

  it("returns empty array when no TodoWrite events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([{ name: "Read", input: { path: "/test" } }]),
    ];
    expect(extractTasks(events)).toEqual([]);
  });

  it("extracts tasks from a TodoWrite event", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Fix bug", status: "completed", description: "Fix the parsing bug" },
              { id: "2", title: "Add tests", status: "in_progress" },
              { id: "3", title: "Deploy", status: "pending" },
            ],
          },
        },
      ]),
    ];

    const tasks = extractTasks(events);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toEqual({
      id: "1",
      title: "Fix bug",
      status: "completed",
      description: "Fix the parsing bug",
    });
    expect(tasks[1]).toEqual({
      id: "2",
      title: "Add tests",
      status: "in_progress",
      description: undefined,
    });
    expect(tasks[2]).toEqual({
      id: "3",
      title: "Deploy",
      status: "pending",
      description: undefined,
    });
  });

  it("uses the LAST TodoWrite event (full replacement semantics)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Old task", status: "pending" },
            ],
          },
        },
      ]),
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Old task", status: "completed" },
              { id: "2", title: "New task", status: "in_progress" },
            ],
          },
        },
      ]),
    ];

    const tasks = extractTasks(events);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].status).toBe("completed");
    expect(tasks[1].title).toBe("New task");
  });

  it("handles TodoWrite with empty todos array", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: { todos: [] },
        },
      ]),
    ];
    expect(extractTasks(events)).toEqual([]);
  });

  it("handles malformed TodoWrite input gracefully", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: { todos: "not-an-array" },
        },
      ]),
    ];
    expect(extractTasks(events)).toEqual([]);
  });

  it("handles TodoWrite with tasks field (alternate key)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            tasks: [
              { id: "1", title: "Task via tasks key", status: "pending" },
            ],
          },
        },
      ]),
    ];

    const tasks = extractTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Task via tasks key");
  });

  it("normalizes status values", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [
              { id: "1", title: "Done", status: "done" },
              { id: "2", title: "Running", status: "running" },
              { id: "3", title: "Complete", status: "complete" },
            ],
          },
        },
      ]),
    ];

    const tasks = extractTasks(events);
    expect(tasks[0].status).toBe("completed");
    expect(tasks[1].status).toBe("in_progress");
    expect(tasks[2].status).toBe("completed");
  });

  it("skips non-assistant events", () => {
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: new Date().toISOString(),
        sessionId: "s1",
        message: { role: "user", content: [{ type: "text", text: "hello" }] },
        userType: "external",
      },
      makeAssistantEvent([
        {
          name: "TodoWrite",
          input: {
            todos: [{ id: "1", title: "Task", status: "pending" }],
          },
        },
      ]),
    ];

    const tasks = extractTasks(events);
    expect(tasks).toHaveLength(1);
  });
});
