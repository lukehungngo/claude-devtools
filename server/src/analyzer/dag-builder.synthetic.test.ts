import { describe, it, expect } from "vitest";
import { buildAgentDAG } from "./dag-builder.js";
import type { SessionEvent } from "../types.js";

function mainDispatch(toolUseId: string, description: string, ts: string): SessionEvent {
  return {
    type: "assistant",
    uuid: `asst-${toolUseId}`,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-6",
      id: `msg-${toolUseId}`,
      type: "message",
      stop_reason: "tool_use",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      content: [
        {
          type: "tool_use",
          id: toolUseId,
          name: "Agent",
          input: { description, subagent_type: "engineer" },
        },
      ],
    },
  } as unknown as SessionEvent;
}

function userToolResult(toolUseId: string, ts: string, isError = false): SessionEvent {
  return {
    type: "user",
    uuid: `user-${toolUseId}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: "done",
          is_error: isError,
        },
      ],
    },
  } as unknown as SessionEvent;
}

describe("buildAgentDAG synthetic nodes (Phase 3.5)", () => {
  it("creates one synthetic node per Agent dispatch with no real subagent", () => {
    const mainEvents: SessionEvent[] = [
      mainDispatch("t1", "task A", "2026-05-16T10:00:00Z"),
      mainDispatch("t2", "task B", "2026-05-16T10:01:00Z"),
      mainDispatch("t3", "task C", "2026-05-16T10:02:00Z"),
      userToolResult("t1", "2026-05-16T10:05:00Z"),
      userToolResult("t2", "2026-05-16T10:06:00Z", true),
    ];
    const dag = buildAgentDAG(mainEvents, new Map(), new Map(), true);
    const synthetic = dag.nodes.filter((n) => n.id.startsWith("synthetic:agent:"));
    expect(synthetic).toHaveLength(3);

    const byTu = new Map(synthetic.map((n) => [n.id, n]));
    expect(byTu.get("synthetic:agent:t1")?.status).toBe("completed");
    expect(byTu.get("synthetic:agent:t2")?.status).toBe("error");
    expect(byTu.get("synthetic:agent:t3")?.status).toBe("active");
  });

  it("each synthetic node has an edge from main", () => {
    const mainEvents: SessionEvent[] = [
      mainDispatch("t1", "task A", "2026-05-16T10:00:00Z"),
    ];
    const dag = buildAgentDAG(mainEvents, new Map(), new Map(), true);
    const edges = dag.edges.filter((e) => e.target === "synthetic:agent:t1");
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("main");
  });

  it("synthetic node falls back to type 'subagent' if subagent_type missing", () => {
    const evt = mainDispatch("t9", "no type", "2026-05-16T10:00:00Z");
    // Strip subagent_type to test fallback
    delete (evt as any).message.content[0].input.subagent_type;
    const dag = buildAgentDAG([evt], new Map(), new Map(), true);
    const n = dag.nodes.find((x) => x.id === "synthetic:agent:t9");
    expect(n?.type).toBe("subagent");
  });

  it("real subagent (with own events + meta) wins over synthetic for same description", () => {
    const mainEvents: SessionEvent[] = [
      mainDispatch("t1", "shared description", "2026-05-16T10:00:00Z"),
    ];
    const subagentEvents = new Map([
      [
        "real-agent-1",
        [
          {
            type: "assistant",
            uuid: "real-1",
            agentId: "real-agent-1",
            timestamp: "2026-05-16T10:00:01Z",
            sessionId: "s1",
            message: {
              role: "assistant",
              model: "claude-sonnet-4-6",
              id: "msg-real",
              type: "message",
              stop_reason: "end_turn",
              usage: {
                input_tokens: 10,
                output_tokens: 5,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
              },
              content: [],
            },
          } as unknown as SessionEvent,
        ],
      ],
    ]);
    const meta = new Map([
      ["real-agent-1", { agentType: "engineer", description: "shared description" }],
    ]);
    const dag = buildAgentDAG(mainEvents, subagentEvents, meta, true);
    expect(dag.nodes.find((n) => n.id === "real-agent-1")).toBeDefined();
    expect(dag.nodes.find((n) => n.id === "synthetic:agent:t1")).toBeUndefined();
  });

  it("dispatches with the same tool_use.id appearing twice produce one synthetic node", () => {
    const evt = mainDispatch("t1", "task", "2026-05-16T10:00:00Z");
    const dag = buildAgentDAG([evt, evt], new Map(), new Map(), true);
    const matches = dag.nodes.filter((n) => n.id === "synthetic:agent:t1");
    expect(matches).toHaveLength(1);
  });
});
