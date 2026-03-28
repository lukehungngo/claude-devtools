import { describe, it, expect } from "vitest";
import { filterDagForTurn } from "./filterDag";
import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";
import type { SessionEvent } from "./types";

function makeNode(id: string, status: "active" | "completed" | "error" = "completed"): AgentNode {
  return {
    id,
    type: id === "main" ? "main" : "subagent",
    description: `Agent ${id}`,
    tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0.001 },
    toolCalls: 1,
    mcpToolCalls: 0,
    status,
  };
}

function makeTurn(agents: { agentId: string; status: string }[]): TurnSnapshot {
  return {
    turnNumber: 1,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
    completedAt: "2026-01-01T00:01:00Z",
    status: "completed",
    promptText: "test",
    events: [] as SessionEvent[],
    agents: agents.map((a) => ({
      agentId: a.agentId,
      agentType: a.agentId,
      displayName: a.agentId,
      invocationCount: 1,
      status: a.status as "running" | "completed" | "error",
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      tools: [],
    })),
    cost: 0,
    costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
  };
}

describe("filterDagForTurn", () => {
  it("always includes main node even when turn has no agents", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main"), makeNode("agent-1")],
      edges: [{ source: "main", target: "agent-1" }],
    };
    const turn = makeTurn([]);
    const result = filterDagForTurn(dag, turn, false);
    expect(result.nodes.some((n) => n.id === "main")).toBe(true);
  });

  it("always includes main node even when dag.nodes is missing main", () => {
    // Simulates a corrupted/race-condition DAG where main is absent
    const dag: AgentDAG = {
      nodes: [makeNode("agent-1")],
      edges: [],
    };
    const turn = makeTurn([{ agentId: "agent-1", status: "completed" }]);
    const result = filterDagForTurn(dag, turn, false);
    expect(result.nodes.some((n) => n.id === "main")).toBe(true);
    expect(result.nodes.find((n) => n.id === "main")!.type).toBe("main");
  });

  it("synthesizes fallback main node when dag has no main", () => {
    const dag: AgentDAG = { nodes: [], edges: [] };
    const turn = makeTurn([]);
    const result = filterDagForTurn(dag, turn, false);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("main");
    expect(result.nodes[0].status).toBe("active");
  });

  it("filters to only turn agents plus main", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main"), makeNode("agent-1"), makeNode("agent-2"), makeNode("agent-3")],
      edges: [
        { source: "main", target: "agent-1" },
        { source: "main", target: "agent-2" },
        { source: "main", target: "agent-3" },
      ],
    };
    const turn = makeTurn([
      { agentId: "main", status: "completed" },
      { agentId: "agent-1", status: "completed" },
    ]);
    const result = filterDagForTurn(dag, turn, false);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["agent-1", "main"]);
    expect(result.edges).toHaveLength(1);
  });

  it("includes active agents in live turn mode", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "active"), makeNode("agent-1", "active"), makeNode("agent-2", "completed")],
      edges: [],
    };
    const turn = makeTurn([{ agentId: "main", status: "running" }]);
    const result = filterDagForTurn(dag, turn, true);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["agent-1", "main"]);
  });

  it("maps turn-level status onto DAG nodes", () => {
    const dag: AgentDAG = {
      nodes: [makeNode("main", "active"), makeNode("agent-1", "active")],
      edges: [],
    };
    const turn = makeTurn([
      { agentId: "main", status: "completed" },
      { agentId: "agent-1", status: "error" },
    ]);
    const result = filterDagForTurn(dag, turn, false);
    expect(result.nodes.find((n) => n.id === "main")!.status).toBe("completed");
    expect(result.nodes.find((n) => n.id === "agent-1")!.status).toBe("error");
  });
});
