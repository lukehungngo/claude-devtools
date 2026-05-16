import { describe, it, expect } from "vitest";
import {
  deriveSessionTasks,
  deriveTasksByTurn,
  deriveTasksTouchedInTurn,
  getTasksAtTurn,
} from "./sessionTasks";
import type { SessionEvent, AssistantEvent } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

function assistant(opts: {
  ts: string;
  toolUses?: Array<{ name: string; input: Record<string, unknown>; id?: string }>;
}): AssistantEvent {
  return {
    type: "assistant",
    uuid: `evt-${opts.ts}`,
    timestamp: opts.ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-6",
      id: `msg-${opts.ts}`,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      content: (opts.toolUses ?? []).map((tu, i) => ({
        type: "tool_use" as const,
        id: tu.id ?? `tu-${opts.ts}-${i}`,
        name: tu.name,
        input: tu.input,
      })),
    },
  } as unknown as AssistantEvent;
}

describe("deriveSessionTasks (Phase 1)", () => {
  it("Fixture A — basic TaskCreate + TaskUpdate(completed)", () => {
    const events: SessionEvent[] = [
      assistant({
        ts: "2026-05-16T10:00:00Z",
        toolUses: [{ name: "TaskCreate", input: { subject: "TASK-001: foo" } }],
      }),
      assistant({
        ts: "2026-05-16T10:01:00Z",
        toolUses: [{ name: "TaskUpdate", input: { taskId: "1", status: "completed" } }],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      id: "T-001",
      taskId: "1",
      name: "TASK-001: foo",
      status: "done",
    });
  });

  it("Fixture B — 3 creates + 3 mixed-order updates", () => {
    const events: SessionEvent[] = [
      assistant({
        ts: "2026-05-16T10:00:00Z",
        toolUses: [
          { name: "TaskCreate", input: { subject: "TASK-001: a" } },
          { name: "TaskCreate", input: { subject: "TASK-002: b" } },
          { name: "TaskCreate", input: { subject: "TASK-003: c" } },
        ],
      }),
      assistant({
        ts: "2026-05-16T10:01:00Z",
        toolUses: [
          { name: "TaskUpdate", input: { taskId: "2", status: "completed" } },
          { name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } },
          { name: "TaskUpdate", input: { taskId: "3", status: "completed" } },
        ],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks.map((t) => `${t.taskId}=${t.status}`)).toEqual([
      "1=in_progress",
      "2=done",
      "3=done",
    ]);
  });

  it("Fixture C — addBlockedBy stores dependency without changing status", () => {
    const events: SessionEvent[] = [
      assistant({
        ts: "t1",
        toolUses: [
          { name: "TaskCreate", input: { subject: "A" } },
          { name: "TaskCreate", input: { subject: "B" } },
          { name: "TaskCreate", input: { subject: "C" } },
        ],
      }),
      assistant({
        ts: "t2",
        toolUses: [{ name: "TaskUpdate", input: { taskId: "1", status: "completed" } }],
      }),
      assistant({
        ts: "t3",
        toolUses: [{ name: "TaskUpdate", input: { taskId: "3", addBlockedBy: ["1"] } }],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    const taskC = tasks.find((t) => t.taskId === "3");
    expect(taskC?.status).toBe("pending");
    expect(taskC?.blockedBy).toEqual(["1"]);
    expect(tasks.find((t) => t.taskId === "1")?.status).toBe("done");
  });

  it("Fixture D — missing subject falls back to description", () => {
    const events: SessionEvent[] = [
      assistant({
        ts: "t1",
        toolUses: [{ name: "TaskCreate", input: { description: "long body of task" } }],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks[0].name).toBe("long body of task");
  });

  it("Fixture F — empty events return empty list", () => {
    expect(deriveSessionTasks([])).toEqual([]);
  });

  it("Fixture G — TaskList no-op", () => {
    const events: SessionEvent[] = [
      assistant({ ts: "t1", toolUses: [{ name: "TaskCreate", input: { subject: "A" } }] }),
      assistant({ ts: "t2", toolUses: [{ name: "TaskList", input: {} }] }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("A");
  });

  it("Fixture H — unknown TaskUpdate.taskId is no-op", () => {
    const events: SessionEvent[] = [
      assistant({ ts: "t1", toolUses: [{ name: "TaskCreate", input: { subject: "A" } }] }),
      assistant({
        ts: "t2",
        toolUses: [{ name: "TaskUpdate", input: { taskId: "99", status: "completed" } }],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("pending");
  });

  it("Fixture I — content-array order: TaskCreate before TaskUpdate in same message", () => {
    const events: SessionEvent[] = [
      assistant({
        ts: "t1",
        toolUses: [
          { name: "TaskCreate", input: { subject: "A" } },
          { name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
        ],
      }),
    ];
    const tasks = deriveSessionTasks(events);
    expect(tasks[0].status).toBe("done");
  });
});

describe("deriveTasksByTurn (Phase 1)", () => {
  function turn(turnNumber: number, startIndex: number, endIndex: number): TurnSnapshot {
    return {
      turnNumber,
      turnIndex: turnNumber - 1,
      userEventUuid: `user-${turnNumber}`,
      startIndex,
      endIndex,
    } as unknown as TurnSnapshot;
  }

  it("Fixture J — TaskGrid reflects same-turn TaskUpdate", () => {
    const a = assistant({
      ts: "t1",
      toolUses: [
        { name: "TaskCreate", input: { subject: "A" } },
        { name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
      ],
    });
    a.uuid = "a1";
    const events: SessionEvent[] = [a];
    const turns = [turn(1, 0, 1)];
    const byTurn = deriveTasksByTurn(events, turns);
    const t1Tasks = byTurn.get(1);
    expect(t1Tasks).toBeDefined();
    expect(t1Tasks![0].status).toBe("done");
  });

  it("Fixture E — getTasksAtTurn returns prior turn's snapshot when current turn has no task tools", () => {
    const a1 = assistant({
      ts: "t1",
      toolUses: [{ name: "TaskCreate", input: { subject: "X" } }],
    });
    a1.uuid = "a1";
    const a3 = assistant({
      ts: "t3",
      toolUses: [{ name: "TaskUpdate", input: { taskId: "1", status: "completed" } }],
    });
    a3.uuid = "a3";
    // Turn 4 has no task tools — getTasksAtTurn(4) should return turn-3's snapshot
    const events: SessionEvent[] = [a1, a3];
    const turns = [turn(1, 0, 1), turn(3, 1, 2)];
    const byTurn = deriveTasksByTurn(events, turns);
    expect(byTurn.get(1)![0].status).toBe("pending");
    expect(byTurn.get(3)![0].status).toBe("done");
    expect(getTasksAtTurn(byTurn, 4)).toEqual(byTurn.get(3));
    expect(getTasksAtTurn(byTurn, 2)).toEqual(byTurn.get(1));
    expect(getTasksAtTurn(byTurn, 0)).toEqual([]);
  });
});

describe("deriveTasksTouchedInTurn (Bug D — per-turn DELTA)", () => {
  function turn(turnNumber: number, startIndex: number, endIndex: number): TurnSnapshot {
    return {
      turnNumber,
      turnIndex: turnNumber - 1,
      userEventUuid: `user-${turnNumber}`,
      startIndex,
      endIndex,
    } as unknown as TurnSnapshot;
  }

  it("scopes each turn to only the tasks Created or Updated in that turn", () => {
    // T1: TaskCreate "a"
    // T2: TaskCreate "b"
    // T3: TaskUpdate(taskId=1, status=completed)
    // T4: no tool uses
    // T5: TaskList only
    const a1 = assistant({
      ts: "t1",
      toolUses: [{ name: "TaskCreate", input: { subject: "a" } }],
    });
    a1.uuid = "a1";
    const a2 = assistant({
      ts: "t2",
      toolUses: [{ name: "TaskCreate", input: { subject: "b" } }],
    });
    a2.uuid = "a2";
    const a3 = assistant({
      ts: "t3",
      toolUses: [{ name: "TaskUpdate", input: { taskId: "1", status: "completed" } }],
    });
    a3.uuid = "a3";
    const a4 = assistant({ ts: "t4", toolUses: [] });
    a4.uuid = "a4";
    const a5 = assistant({
      ts: "t5",
      toolUses: [{ name: "TaskList", input: {} }],
    });
    a5.uuid = "a5";

    const events: SessionEvent[] = [a1, a2, a3, a4, a5];
    const turns = [turn(1, 0, 1), turn(2, 1, 2), turn(3, 2, 3), turn(4, 3, 4), turn(5, 4, 5)];

    const result = deriveTasksTouchedInTurn(events, turns);

    // T1 — created "a" only.
    const t1 = result.get(1);
    expect(t1).toBeDefined();
    expect(t1).toHaveLength(1);
    expect(t1![0].name).toBe("a");
    expect(t1![0].status).toBe("pending");

    // T2 — created "b" only (NOT "a", even though "a" exists in cumulative state).
    const t2 = result.get(2);
    expect(t2).toBeDefined();
    expect(t2).toHaveLength(1);
    expect(t2![0].name).toBe("b");
    expect(t2![0].status).toBe("pending");

    // T3 — updated "a" only; post-turn status is "done".
    const t3 = result.get(3);
    expect(t3).toBeDefined();
    expect(t3).toHaveLength(1);
    expect(t3![0].name).toBe("a");
    expect(t3![0].status).toBe("done");

    // T4 — no tool uses → absent.
    expect(result.get(4)).toBeUndefined();

    // T5 — TaskList only → absent (no touch).
    expect(result.get(5)).toBeUndefined();
  });

  it("same-turn Create+Update collapses into one entry with the final status", () => {
    const a = assistant({
      ts: "t1",
      toolUses: [
        { name: "TaskCreate", input: { subject: "A" } },
        { name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
      ],
    });
    a.uuid = "a1";
    const events: SessionEvent[] = [a];
    const turns = [turn(1, 0, 1)];

    const result = deriveTasksTouchedInTurn(events, turns);
    const t1 = result.get(1);
    expect(t1).toHaveLength(1);
    expect(t1![0].status).toBe("done");
  });

  it("TaskUpdate against an unknown taskId does not mark the turn as touched", () => {
    const a1 = assistant({
      ts: "t1",
      toolUses: [{ name: "TaskCreate", input: { subject: "A" } }],
    });
    a1.uuid = "a1";
    const a2 = assistant({
      ts: "t2",
      toolUses: [{ name: "TaskUpdate", input: { taskId: "99", status: "completed" } }],
    });
    a2.uuid = "a2";
    const events: SessionEvent[] = [a1, a2];
    const turns = [turn(1, 0, 1), turn(2, 1, 2)];

    const result = deriveTasksTouchedInTurn(events, turns);
    expect(result.get(1)).toHaveLength(1);
    expect(result.get(2)).toBeUndefined();
  });
});
