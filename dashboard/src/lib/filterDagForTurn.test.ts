import { describe, it, expect } from "vitest";
import { filterDagForTurn } from "./filterDagForTurn";
import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

function makeNode(id: string): AgentNode {
  return {
    id,
    type: "agent",
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
    },
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "completed",
  };
}

function makeTurn(agents: { agentId: string }[]): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "test",
    startIndex: 0,
    endIndex: 0,
    agents: agents.map((a) => ({
      agentId: a.agentId,
      agentType: "agent",
      displayName: a.agentId,
      invocationCount: 1,
      status: "completed" as const,
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      tools: [],
    })),
    status: "running",
    cost: 0,
    costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
    durationMs: null,
    startTime: "2026-01-01T00:00:00Z",
    completedAt: "",
    endTime: "",
  };
}

const fullDag: AgentDAG = {
  nodes: [makeNode("main"), makeNode("agent-1"), makeNode("agent-2")],
  edges: [
    { source: "main", target: "agent-1" },
    { source: "main", target: "agent-2" },
  ],
};

describe("filterDagForTurn", () => {
  it("returns null when dag is null", () => {
    expect(filterDagForTurn(null, makeTurn([]))).toBeNull();
  });

  it("returns full dag when activeTurn is undefined", () => {
    expect(filterDagForTurn(fullDag, undefined)).toBe(fullDag);
  });

  it("returns full dag when activeTurn has empty agents array (brand-new turn)", () => {
    const emptyTurn = makeTurn([]);
    const result = filterDagForTurn(fullDag, emptyTurn);
    expect(result).toBe(fullDag);
  });

  it("filters dag to only agents in the active turn plus main", () => {
    const turn = makeTurn([{ agentId: "agent-1" }]);
    const result = filterDagForTurn(fullDag, turn)!;
    expect(result.nodes.map((n) => n.id)).toEqual(["main", "agent-1"]);
    expect(result.edges).toEqual([{ source: "main", target: "agent-1" }]);
  });

  it("always includes main node even if not in turn agents", () => {
    const turn = makeTurn([{ agentId: "agent-2" }]);
    const result = filterDagForTurn(fullDag, turn)!;
    expect(result.nodes.map((n) => n.id)).toContain("main");
  });

  it("returns same reference when called with same agent set and previous result", () => {
    const turn = makeTurn([{ agentId: "agent-1" }]);
    const first = filterDagForTurn(fullDag, turn, null);
    const second = filterDagForTurn(fullDag, turn, first);
    expect(second).toBe(first); // same reference, not a new object
  });

  it("returns new result when agent set changes", () => {
    const turn1 = makeTurn([{ agentId: "agent-1" }]);
    const turn2 = makeTurn([{ agentId: "agent-1" }, { agentId: "agent-2" }]);
    const first = filterDagForTurn(fullDag, turn1, null);
    const second = filterDagForTurn(fullDag, turn2, first);
    expect(second).not.toBe(first);
    expect(second!.nodes.map((n) => n.id)).toEqual(["main", "agent-1", "agent-2"]);
  });

  it("overrides node costs with turn-specific values from AgentSummary", () => {
    const dagWithCosts: AgentDAG = {
      nodes: [
        { ...makeNode("main"), tokenUsage: { inputTokens: 50000, outputTokens: 20000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 5.0 } },
        { ...makeNode("agent-1"), tokenUsage: { inputTokens: 10000, outputTokens: 5000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 1.5 } },
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };

    const turn: TurnSnapshot = {
      turnNumber: 1,
      promptText: "test",
      startIndex: 0,
      endIndex: 10,
      agents: [
        {
          agentId: "main",
          agentType: "main",
          displayName: "Main session",
          invocationCount: 3,
          status: "completed",
          cost: 0.45,       // main agent's own cost from tokens × model pricing
          tokensIn: 5000,
          tokensOut: 2000,
          tools: ["Read", "Write"],
        },
        {
          agentId: "agent-1",
          agentType: "engineer",
          displayName: "agent-1",
          invocationCount: 1,
          status: "completed",
          cost: 0.8,
          tokensIn: 3000,
          tokensOut: 1000,
          tools: ["Write", "Edit"],
        },
      ],
      status: "completed",
      cost: 1.25,
      costBreakdown: { total: 1.25, tokensIn: 8000, tokensOut: 3000 },
      durationMs: 5000,
      startTime: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:05Z",
      endTime: "2026-01-01T00:00:05Z",
    };

    const result = filterDagForTurn(dagWithCosts, turn)!;
    const mainNode = result.nodes.find((n) => n.id === "main")!;
    const agentNode = result.nodes.find((n) => n.id === "agent-1")!;

    // Main cost comes directly from AgentSummary (tokens × model pricing)
    expect(mainNode.tokenUsage.totalCost).toBeCloseTo(0.45);
    expect(mainNode.tokenUsage.inputTokens).toBe(5000);
    expect(mainNode.tokenUsage.outputTokens).toBe(2000);

    // Subagent cost also from AgentSummary
    expect(agentNode.tokenUsage.totalCost).toBeCloseTo(0.8);
    expect(agentNode.tokenUsage.inputTokens).toBe(3000);
    expect(agentNode.tokenUsage.outputTokens).toBe(1000);
  });
});
