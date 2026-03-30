import { describe, it, expect } from "vitest";
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

describe("buildAgentDAG single-pass optimization", () => {
  it("produces correct results for a complex DAG with mixed events", () => {
    // Build a non-trivial scenario: main with 3 subagents, mixed tool calls + MCP
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:00Z",
        content: [
          { type: "tool_use", id: "t1", name: "Agent", input: { description: "explore code" } },
          { type: "tool_use", id: "t2", name: "mcp__server__read", input: {} },
          { type: "tool_use", id: "t3", name: "Read", input: {} },
        ],
        usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 25 },
      }),
      makeAssistantEvent({
        timestamp: "2020-01-01T00:00:02Z",
        content: [
          { type: "tool_use", id: "t4", name: "Agent", input: { description: "write tests" } },
          { type: "tool_use", id: "t5", name: "Bash", input: {} },
        ],
        usage: { input_tokens: 300, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 },
      }),
      // User event with error
      {
        type: "user",
        uuid: "u1",
        timestamp: "2020-01-01T00:00:03Z",
        sessionId: "test-session",
        userType: "internal",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t5", content: "error", is_error: true },
          ],
        },
      } as SessionEvent,
    ];

    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent({ timestamp: "2020-01-01T00:00:01Z" })]],
      ["agent-2", [makeAssistantEvent({ timestamp: "2020-01-01T00:00:03Z" })]],
      ["agent-3", [makeAssistantEvent({ timestamp: "2020-01-01T00:00:04Z" })]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore code" }],
      ["agent-2", { agentType: "Engineer", description: "write tests" }],
      ["agent-3", { agentType: "Reviewer", description: "review code" }],
    ]);

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    // Main node correctness
    const mainNode = dag.nodes.find(n => n.id === "main")!;
    expect(mainNode.tokenUsage.inputTokens).toBe(500);
    expect(mainNode.tokenUsage.outputTokens).toBe(250);
    expect(mainNode.tokenUsage.cacheWriteTokens).toBe(50);
    expect(mainNode.tokenUsage.cacheReadTokens).toBe(125);
    expect(mainNode.toolCalls).toBe(5); // t1-t5
    expect(mainNode.mcpToolCalls).toBe(1); // mcp__server__read
    expect(mainNode.status).toBe("error"); // last user event has is_error

    // Edge detection via Agent tool_use descriptions
    const edgeFromMain = dag.edges.filter(e => e.source === "main");
    expect(edgeFromMain).toContainEqual({ source: "main", target: "agent-1" });
    expect(edgeFromMain).toContainEqual({ source: "main", target: "agent-2" });
    // agent-3 has no matching Agent call but gets default edge
    expect(edgeFromMain).toContainEqual({ source: "main", target: "agent-3" });

    // All 4 nodes present
    expect(dag.nodes).toHaveLength(4);
    expect(dag.edges).toHaveLength(3);
  });

  it("uses descriptionToAgentId map for O(1) edge lookups", () => {
    // With many subagents, the old nested loop would be O(N*M).
    // This test verifies correctness with many subagents.
    const mainEvents: SessionEvent[] = [];
    const subagentEvents = new Map<string, SessionEvent[]>();
    const subagentMeta = new Map<string, { agentType: string; description: string }>();

    for (let i = 0; i < 50; i++) {
      mainEvents.push(
        makeAssistantEvent({
          timestamp: "2020-01-01T00:00:00Z",
          content: [
            { type: "tool_use", id: `t${i}`, name: "Agent", input: { description: `task-${i}` } },
          ],
        })
      );
      subagentEvents.set(`agent-${i}`, [makeAssistantEvent({ timestamp: "2020-01-01T00:00:01Z" })]);
      subagentMeta.set(`agent-${i}`, { agentType: "Engineer", description: `task-${i}` });
    }

    const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

    expect(dag.nodes).toHaveLength(51); // main + 50
    expect(dag.edges).toHaveLength(50); // each agent has one edge
    for (let i = 0; i < 50; i++) {
      expect(dag.edges).toContainEqual({ source: "main", target: `agent-${i}` });
    }
  });
});
