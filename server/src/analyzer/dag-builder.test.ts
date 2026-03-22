import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAgentDAG, aggregateTokens } from "./dag-builder.js";
import type { SessionEvent, AssistantEvent } from "../types.js";

function makeAssistantEvent(
  overrides: {
    uuid?: string;
    timestamp?: string;
    content?: AssistantEvent["message"]["content"];
    usage?: Partial<AssistantEvent["message"]["usage"]>;
    model?: string;
  } = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid || "uuid-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: overrides.content || [{ type: "text", text: "hello" }],
      model: overrides.model || "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
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

  it("determines completed status for old events", () => {
    // Event from a long time ago
    const oldEvents: SessionEvent[] = [
      makeAssistantEvent({ timestamp: "2020-01-01T00:00:00Z" }),
    ];

    const dag = buildAgentDAG(oldEvents, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("completed");
  });

  it("determines active status for recent events (within 30s)", () => {
    // Event from right now
    const recentEvents: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: new Date().toISOString(),
      }),
    ];

    const dag = buildAgentDAG(recentEvents, new Map(), new Map());

    expect(dag.nodes[0].status).toBe("active");
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
    const dag = buildAgentDAG([], new Map(), new Map());

    expect(dag.nodes).toHaveLength(1);
    expect(dag.nodes[0].id).toBe("main");
    expect(dag.nodes[0].status).toBe("completed");
    expect(dag.nodes[0].toolCalls).toBe(0);
  });

  it("uses 'unknown' type when subagentMeta is missing", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
    ]);

    const dag = buildAgentDAG(
      [makeAssistantEvent()],
      subagentEvents,
      new Map() // no meta
    );

    const agentNode = dag.nodes.find((n) => n.id === "agent-1");
    expect(agentNode!.type).toBe("unknown");
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
