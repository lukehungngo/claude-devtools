import { describe, it, expect } from "vitest";
import { buildAgentDAG, aggregateTokens } from "./dag-builder.js";
import type { SessionEvent, AssistantEvent, UserEvent, SystemEvent } from "../types.js";

function makeAssistantEvent(
  overrides: {
    uuid?: string;
    timestamp?: string;
    content?: AssistantEvent["message"]["content"];
    usage?: Partial<AssistantEvent["message"]["usage"]>;
    model?: string;
    stopReason?: "end_turn" | "tool_use" | null;
    agentId?: string;
    isSidechain?: boolean;
  } = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid || "uuid-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "test-session",
    ...(overrides.isSidechain !== undefined && { isSidechain: overrides.isSidechain }),
    ...(overrides.agentId !== undefined && { agentId: overrides.agentId }),
    message: {
      role: "assistant",
      content: overrides.content || [{ type: "text", text: "hello" }],
      model: overrides.model || "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: overrides.stopReason ?? "end_turn",
      usage: {
        input_tokens: overrides.usage?.input_tokens ?? 100,
        output_tokens: overrides.usage?.output_tokens ?? 50,
        cache_creation_input_tokens:
          overrides.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens:
          overrides.usage?.cache_read_input_tokens ?? 0,
      },
    },
  };
}

function makeUserEvent(overrides: {
  uuid?: string;
  timestamp?: string;
  agentId?: string;
  isSidechain?: boolean;
  content?: UserEvent["message"]["content"];
}): UserEvent {
  return {
    type: "user",
    uuid: overrides.uuid || "u-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "test-session",
    userType: "internal",
    ...(overrides.isSidechain !== undefined && { isSidechain: overrides.isSidechain }),
    ...(overrides.agentId !== undefined && { agentId: overrides.agentId }),
    message: {
      role: "user",
      content: overrides.content || [{ type: "text", text: "hi" }],
    },
  };
}

describe("buildAgentDAG", () => {
  it("always creates a main node", () => {
    const dag = buildAgentDAG(
      [makeAssistantEvent()],
      new Map(),
      new Map()
    );

    expect(dag.nodes).toHaveLength(1);
    expect(dag.nodes[0].id).toBe("main");
    expect(dag.nodes[0].type).toBe("main");
  });

  it("creates subagent nodes for each entry in subagentEvents", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
      ["agent-2", [makeAssistantEvent()]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore stuff" }],
      ["agent-2", { agentType: "Plan", description: "plan stuff" }],
    ]);

    const dag = buildAgentDAG(
      [makeAssistantEvent()],
      subagentEvents,
      subagentMeta
    );

    expect(dag.nodes).toHaveLength(3); // main + 2 subagents
    const agentNode1 = dag.nodes.find((n) => n.id === "agent-1");
    expect(agentNode1).toBeDefined();
    expect(agentNode1!.type).toBe("Explore");
    expect(agentNode1!.description).toBe("explore stuff");
    expect(agentNode1!.parentId).toBe("main");
  });

  it("creates edges from main to subagents via Agent tool_use", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Agent",
            input: { description: "explore stuff" },
          },
        ],
      }),
    ];
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore stuff" }],
    ]);

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    expect(dag.edges).toContainEqual({
      source: "main",
      target: "agent-1",
    });
  });

  it("creates default edges for subagents not matched by Agent tool_use", () => {
    const mainEvents: SessionEvent[] = [makeAssistantEvent()];
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "unmatched" }],
    ]);

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    expect(dag.edges).toContainEqual({
      source: "main",
      target: "agent-1",
    });
  });

  it("marks main active when last assistant event has tool_use (no end_turn, no turn_duration)", () => {
    // Agent still mid-computation: no terminal signal emitted.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:00Z",
        stopReason: "tool_use",
      }),
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("active");
  });

  it("marks main completed when last assistant event has stop_reason=end_turn (no timer)", () => {
    // Predicate is time-invariant: timestamp old vs new does not matter.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:00Z",
        stopReason: "end_turn",
      }),
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("completed");
  });

  it("marks main completed even when last assistant event is recent (no flash bug)", () => {
    // Previously: recent end_turn was treated as "active" to prevent flash.
    // New predicate: end_turn is authoritative regardless of recency.
    // The flash bug is now prevented by having a single stable predicate
    // instead of a time-dependent heuristic.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: new Date().toISOString(),
        stopReason: "end_turn",
      }),
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("completed");
  });

  it("marks main completed via turn_duration system event (Signal 2)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ stopReason: "tool_use" }),
      {
        type: "system",
        subtype: "turn_duration",
        uuid: "sys-1",
        timestamp: "2026-03-23T10:00:01Z",
        sessionId: "test-session",
        durationMs: 1234,
      } as SystemEvent,
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("completed");
  });

  it("counts tool calls correctly on main node", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: {} },
          { type: "tool_use", id: "t2", name: "Bash", input: {} },
        ],
      }),
    ];

    const dag = buildAgentDAG(mainEvents, new Map(), new Map());

    expect(dag.nodes[0].toolCalls).toBe(2);
  });

  it("counts MCP tool calls separately", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          { type: "tool_use", id: "t1", name: "mcp__server__tool", input: {} },
          { type: "tool_use", id: "t2", name: "Read", input: {} },
        ],
      }),
    ];

    const dag = buildAgentDAG(mainEvents, new Map(), new Map());

    expect(dag.nodes[0].mcpToolCalls).toBe(1);
    expect(dag.nodes[0].toolCalls).toBe(2);
  });

  it("handles empty event arrays", () => {
    // Empty events: no terminal signal → "active" (no data to declare completion).
    const dag = buildAgentDAG([], new Map(), new Map());

    expect(dag.nodes).toHaveLength(1);
    expect(dag.nodes[0].id).toBe("main");
    expect(dag.nodes[0].status).toBe("active");
    expect(dag.nodes[0].toolCalls).toBe(0);
  });

  it("uses agentId as type when subagentMeta is missing (never 'unknown')", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
    ]);

    const dag = buildAgentDAG(
      [makeAssistantEvent()],
      subagentEvents,
      new Map() // no meta
    );

    const agentNode = dag.nodes.find((n) => n.id === "agent-1");
    expect(agentNode!.type).toBe("agent-1");
    expect(agentNode!.type).not.toBe("unknown");
  });

  it("does not create duplicate edges when Agent is invoked multiple times with same description", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Agent",
            input: { description: "explore stuff" },
          },
        ],
      }),
      makeAssistantEvent({
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "Agent",
            input: { description: "explore stuff" },
          },
        ],
      }),
    ];
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore stuff" }],
    ]);

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    // Should have exactly one edge from main to agent-1, not two
    const edgesToAgent1 = dag.edges.filter((e) => e.target === "agent-1");
    expect(edgesToAgent1).toHaveLength(1);
  });

  it("sets model on main node from the assistant event model", () => {
    const dag = buildAgentDAG(
      [makeAssistantEvent({ model: "claude-opus-4-6" })],
      new Map(),
      new Map()
    );
    expect(dag.nodes[0].model).toBe("claude-opus-4-6");
  });

  it("sets model on subagent node from its own events", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent({ model: "claude-sonnet-4-6" })]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);
    const dag = buildAgentDAG(
      [makeAssistantEvent({ model: "claude-opus-4-6" })],
      subagentEvents,
      subagentMeta
    );
    const subagentNode = dag.nodes.find((n) => n.id === "agent-1")!;
    expect(subagentNode.model).toBe("claude-sonnet-4-6");
  });

  it("uses the last assistant event model when multiple events have different models", () => {
    const dag = buildAgentDAG(
      [
        makeAssistantEvent({ model: "claude-opus-4-6" }),
        makeAssistantEvent({ model: "claude-sonnet-4-6" }),
      ],
      new Map(),
      new Map()
    );
    expect(dag.nodes[0].model).toBe("claude-sonnet-4-6");
  });

  it("detects error status from tool_result with is_error in user events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:00Z",
        content: [
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "exit 1" } },
        ],
      }),
      {
        type: "user",
        uuid: "u1",
        timestamp: "2020-01-01T00:00:01Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: "Command failed with exit code 1",
              is_error: true,
            },
          ],
        },
      } as SessionEvent,
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("error");
  });

  it("error takes precedence over completion (end_turn present but tool_result has is_error)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "Bash", input: {} },
        ],
      }),
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T10:00:01Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true },
          ],
        },
      } as SessionEvent,
      makeAssistantEvent({ stopReason: "end_turn" }),
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("error");
  });

  it("detects error from a tool_result that is NOT among the last 3 events (time-invariant error)", () => {
    // Previously: only the last 3 user events were scanned for is_error.
    // New: scan the full event stream — error is a content check, not a window.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:00Z",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
      }),
      // Error in an older user event
      {
        type: "user",
        uuid: "u1",
        timestamp: "2020-01-01T00:00:01Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true },
          ],
        },
      } as SessionEvent,
      // Many subsequent non-error events — old "last 3" logic would miss the error above
      makeAssistantEvent({ stopReason: "tool_use" }),
      makeUserEvent({ content: [{ type: "text", text: "ok" }] }),
      makeAssistantEvent({ stopReason: "tool_use" }),
      makeUserEvent({ content: [{ type: "text", text: "ok" }] }),
      makeAssistantEvent({ stopReason: "tool_use" }),
    ];

    const dag = buildAgentDAG(events, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("error");
  });

  it("subagent status: marks completed when subagent emitted end_turn", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      [
        "agent-1",
        [
          makeAssistantEvent({
            timestamp: "2026-03-23T10:00:01Z",
            agentId: "agent-1",
            isSidechain: true,
            stopReason: "end_turn",
          }),
        ],
      ],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);

    const dag = buildAgentDAG(
      [makeAssistantEvent({ stopReason: "tool_use" })],
      subagentEvents,
      subagentMeta
    );

    const sub = dag.nodes.find((n) => n.id === "agent-1")!;
    expect(sub.status).toBe("completed");
  });

  it("subagent status: marks completed via parent tool_result ack (Signal 3)", () => {
    // Subagent finished without end_turn (e.g., exited on tool_use).
    // Parent emits a tool_result user event AFTER the subagent's last event
    // → subagent is acknowledged by parent → completed.
    const subagentEvents = new Map<string, SessionEvent[]>([
      [
        "agent-1",
        [
          makeAssistantEvent({
            timestamp: "2026-03-23T10:00:01Z",
            agentId: "agent-1",
            isSidechain: true,
            stopReason: "tool_use",
          }),
        ],
      ],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);

    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-03-23T10:00:00Z",
        content: [
          { type: "tool_use", id: "t1", name: "Agent", input: { description: "explore" } },
        ],
        stopReason: "tool_use",
      }),
      // tool_result from parent AFTER subagent's last event
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T10:00:02Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "done" },
          ],
        },
      } as SessionEvent,
    ];

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    const sub = dag.nodes.find((n) => n.id === "agent-1")!;
    expect(sub.status).toBe("completed");
  });

  it("subagent status: marks active when no terminal signal present", () => {
    // Must be "active": subagent stopped on tool_use (no Signal 1), and main
    // has a single assistant event with ONLY a text content block — so there
    // is NO tool_result anywhere in the merged stream, defeating Signal 3.
    // If a future test-helper change adds a tool_result to the default
    // main fixture, this assertion would flip silently. Keep main minimal.
    const subagentEvents = new Map<string, SessionEvent[]>([
      [
        "agent-1",
        [
          makeAssistantEvent({
            timestamp: "2026-03-23T10:00:01Z",
            agentId: "agent-1",
            isSidechain: true,
            stopReason: "tool_use",
          }),
        ],
      ],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);

    // Parent has no tool_result for this subagent's dispatch → Signal 3 fails.
    const dag = buildAgentDAG(
      [makeAssistantEvent({ stopReason: "tool_use" })],
      subagentEvents,
      subagentMeta
    );

    const sub = dag.nodes.find((n) => n.id === "agent-1")!;
    expect(sub.status).toBe("active");
  });

  // Transitive SDK invariant at the DAG level:
  // main completed ⇒ every subagent node is completed or errored.
  it("main completed in DAG ⇒ every subagent node is completed or errored", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-03-23T10:00:00Z",
        content: [
          { type: "tool_use", id: "t1", name: "Agent", input: { description: "explore" } },
        ],
        stopReason: "tool_use",
      }),
      // Parent's tool_result for the subagent dispatch
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T10:00:02Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "done" },
          ],
        },
      } as SessionEvent,
      // Final assistant event with end_turn → main completed
      makeAssistantEvent({
        timestamp: "2026-03-23T10:00:03Z",
        stopReason: "end_turn",
      }),
    ];
    const subagentEvents = new Map<string, SessionEvent[]>([
      [
        "agent-1",
        [
          makeAssistantEvent({
            timestamp: "2026-03-23T10:00:01Z",
            agentId: "agent-1",
            isSidechain: true,
            stopReason: "tool_use",
          }),
        ],
      ],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    const main = dag.nodes.find((n) => n.id === "main");
    if (main?.status !== "completed") return; // vacuously true
    for (const node of dag.nodes) {
      if (node.id === "main") continue;
      expect(node.status).toMatch(/^(completed|error)$/);
    }
  });
});

describe("aggregateTokens", () => {
  it("sums input, output, cacheWrite, cacheRead tokens from assistant events", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      }),
      makeAssistantEvent({
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 10,
        },
      }),
    ];

    const tokens = aggregateTokens(events);

    expect(tokens.inputTokens).toBe(300);
    expect(tokens.outputTokens).toBe(150);
    expect(tokens.cacheWriteTokens).toBe(30);
    expect(tokens.cacheReadTokens).toBe(15);
    expect(tokens.totalCost).toBeGreaterThan(0);
  });

  it("ignores non-assistant events", () => {
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T10:00:00Z",
        sessionId: "s1",
        userType: "external",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      } as SessionEvent,
    ];

    const tokens = aggregateTokens(events);

    expect(tokens.inputTokens).toBe(0);
    expect(tokens.outputTokens).toBe(0);
  });

  it("returns zero tokens for empty events array", () => {
    const tokens = aggregateTokens([]);

    expect(tokens.inputTokens).toBe(0);
    expect(tokens.outputTokens).toBe(0);
    expect(tokens.cacheWriteTokens).toBe(0);
    expect(tokens.cacheReadTokens).toBe(0);
    expect(tokens.totalCost).toBe(0);
  });
});
