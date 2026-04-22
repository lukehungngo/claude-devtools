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
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      tools: [],
    })),
    cost: 0,
    costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    durationMs: null,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "",
    // TASK-002: dispatchedAgentIds is now required on TurnSnapshot. Mirror
    // production semantics by including "main" plus any agentIds in the fixture.
    dispatchedAgentIds: new Set<string>(["main", ...agents.map((a) => a.agentId)]),
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
    expect(filterDagForTurn(null, makeTurn([]), null)).toBeNull();
  });

  it("returns full dag when activeTurn is undefined", () => {
    expect(filterDagForTurn(fullDag, undefined, null)).toBe(fullDag);
  });

  it("returns only main node when turn has empty agents array", () => {
    const emptyTurn = makeTurn([]);
    const result = filterDagForTurn(fullDag, emptyTurn, null)!;
    expect(result).not.toBe(fullDag);
    expect(result.nodes.map((n) => n.id)).toEqual(["main"]);
    expect(result.edges).toEqual([]);
  });

  it("returns only main node when turn only has main (no subagents dispatched)", () => {
    const mainOnlyTurn = makeTurn([{ agentId: "main" }]);
    const result = filterDagForTurn(fullDag, mainOnlyTurn, null)!;
    expect(result).not.toBe(fullDag);
    expect(result.nodes.map((n) => n.id)).toEqual(["main"]);
    expect(result.edges).toEqual([]);
  });

  it("applies turn-specific token data to main node in main-only turn", () => {
    const dagWithCosts: AgentDAG = {
      nodes: [
        { ...makeNode("main"), tokenUsage: { inputTokens: 50000, outputTokens: 20000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 5.0 } },
        makeNode("agent-1"),
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };
    const mainOnlyTurn: TurnSnapshot = {
      ...makeTurn([{ agentId: "main" }]),
      durationMs: 2000,
      startTime: "2026-01-01T00:10:00Z",
      endTime: "2026-01-01T00:10:02Z",
      agents: [
        { agentId: "main", agentType: "main", displayName: "Main session", invocationCount: 1, cost: 0.05, tokensIn: 200, tokensOut: 100, tools: ["Read"] },
      ],
    };
    const result = filterDagForTurn(dagWithCosts, mainOnlyTurn, null)!;
    expect(result.nodes).toHaveLength(1);
    const mainNode = result.nodes[0];
    expect(mainNode.tokenUsage.inputTokens).toBe(200);
    expect(mainNode.tokenUsage.outputTokens).toBe(100);
    expect(mainNode.tokenUsage.totalCost).toBeCloseTo(0.05);
    expect(mainNode.startTime).toBe("2026-01-01T00:10:00Z");
    expect(mainNode.endTime).toBe("2026-01-01T00:10:02Z");
  });

  it("filters dag to only agents in the active turn plus main", () => {
    const turn = makeTurn([{ agentId: "agent-1" }]);
    const result = filterDagForTurn(fullDag, turn, null)!;
    expect(result.nodes.map((n) => n.id)).toEqual(["main", "agent-1"]);
    expect(result.edges).toEqual([{ source: "main", target: "agent-1" }]);
  });

  it("always includes main node even if not in turn agents", () => {
    const turn = makeTurn([{ agentId: "agent-2" }]);
    const result = filterDagForTurn(fullDag, turn, null)!;
    expect(result.nodes.map((n) => n.id)).toContain("main");
  });

  it("uses eventAgentIds for membership when provided", () => {
    // Turn agents only has main, but events show agent-2 was active
    const mainOnlyTurn = makeTurn([{ agentId: "main" }]);
    const eventIds = new Set(["main", "agent-2"]);
    const result = filterDagForTurn(fullDag, mainOnlyTurn, eventIds)!;
    expect(result.nodes.map((n) => n.id)).toEqual(["main", "agent-2"]);
    expect(result.edges).toEqual([{ source: "main", target: "agent-2" }]);
  });

  it("falls back to TurnSnapshot.agents when eventAgentIds is null", () => {
    const turn = makeTurn([{ agentId: "agent-1" }]);
    const result = filterDagForTurn(fullDag, turn, null)!;
    expect(result.nodes.map((n) => n.id)).toEqual(["main", "agent-1"]);
  });

  it("returns same reference when called with same agent set and previous result", () => {
    const turn = makeTurn([{ agentId: "agent-1" }]);
    const first = filterDagForTurn(fullDag, turn, null);
    const second = filterDagForTurn(fullDag, turn, null, first);
    expect(second).toBe(first); // same reference, not a new object
  });

  it("returns new result when agent set changes", () => {
    const turn1 = makeTurn([{ agentId: "agent-1" }]);
    const turn2 = makeTurn([{ agentId: "agent-1" }, { agentId: "agent-2" }]);
    const first = filterDagForTurn(fullDag, turn1, null);
    const second = filterDagForTurn(fullDag, turn2, null, first);
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
          cost: 0.8,
          tokensIn: 3000,
          tokensOut: 1000,
          tools: ["Write", "Edit"],
        },
      ],
      cost: 1.25,
      costBreakdown: { total: 1.25, inputCost: 0.75, outputCost: 0.50 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 5000,
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-01T00:00:05Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const result = filterDagForTurn(dagWithCosts, turn, null)!;
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

  it("returns new reference when same agent IDs but different token data", () => {
    const dagWithCosts: AgentDAG = {
      nodes: [
        { ...makeNode("main"), tokenUsage: { inputTokens: 50000, outputTokens: 20000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 5.0 } },
        { ...makeNode("agent-1"), tokenUsage: { inputTokens: 10000, outputTokens: 5000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 1.5 } },
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };

    const turnA: TurnSnapshot = {
      turnNumber: 1,
      promptText: "turn A",
      startIndex: 0,
      endIndex: 5,
      agents: [
        { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0.10, tokensIn: 100, tokensOut: 50, tools: ["Read"] },
        { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0.20, tokensIn: 200, tokensOut: 100, tools: ["Write"] },
      ],
      cost: 0.30,
      costBreakdown: { total: 0.30, inputCost: 0.15, outputCost: 0.15 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 1000,
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-01T00:00:01Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const turnB: TurnSnapshot = {
      turnNumber: 2,
      promptText: "turn B",
      startIndex: 6,
      endIndex: 10,
      agents: [
        { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 2, cost: 0.50, tokensIn: 500, tokensOut: 250, tools: ["Read", "Write"] },
        { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0.80, tokensIn: 400, tokensOut: 200, tools: ["Edit"] },
      ],
      cost: 1.30,
      costBreakdown: { total: 1.30, inputCost: 0.70, outputCost: 0.60 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 3000,
      startTime: "2026-01-01T00:01:00Z",
      endTime: "2026-01-01T00:01:03Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const resultA = filterDagForTurn(dagWithCosts, turnA, null);
    const resultB = filterDagForTurn(dagWithCosts, turnB, null, resultA);

    // Must be a different reference — same agents but different data
    expect(resultB).not.toBe(resultA);

    // resultB must have turnB's token data
    const agent1B = resultB!.nodes.find((n) => n.id === "agent-1")!;
    expect(agent1B.tokenUsage.inputTokens).toBe(400);
    expect(agent1B.tokenUsage.outputTokens).toBe(200);
    expect(agent1B.tokenUsage.totalCost).toBeCloseTo(0.80);

    const mainB = resultB!.nodes.find((n) => n.id === "main")!;
    expect(mainB.tokenUsage.inputTokens).toBe(500);
    expect(mainB.tokenUsage.outputTokens).toBe(250);
  });

  it("returns new reference when main tokens are identical but sub-agent tokens differ", () => {
    const dagWithCosts: AgentDAG = {
      nodes: [
        { ...makeNode("main"), tokenUsage: { inputTokens: 50000, outputTokens: 20000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 5.0 } },
        { ...makeNode("agent-1"), tokenUsage: { inputTokens: 10000, outputTokens: 5000, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 1.5 } },
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };

    // turnA and turnB have IDENTICAL main tokens but DIFFERENT agent-1 tokens
    const turnA: TurnSnapshot = {
      turnNumber: 1,
      promptText: "turn A",
      startIndex: 0,
      endIndex: 5,
      agents: [
        { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0.10, tokensIn: 100, tokensOut: 50, tools: ["Read"] },
        { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0.20, tokensIn: 200, tokensOut: 100, tools: ["Write"] },
      ],
      cost: 0.30,
      costBreakdown: { total: 0.30, inputCost: 0.15, outputCost: 0.15 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 1000,
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-01T00:00:01Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const turnB: TurnSnapshot = {
      turnNumber: 2,
      promptText: "turn B",
      startIndex: 6,
      endIndex: 10,
      agents: [
        // SAME main tokens as turnA
        { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0.10, tokensIn: 100, tokensOut: 50, tools: ["Read"] },
        // DIFFERENT agent-1 tokens
        { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0.80, tokensIn: 400, tokensOut: 200, tools: ["Edit"] },
      ],
      cost: 0.90,
      costBreakdown: { total: 0.90, inputCost: 0.50, outputCost: 0.40 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 2000,
      startTime: "2026-01-01T00:01:00Z",
      endTime: "2026-01-01T00:01:02Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const resultA = filterDagForTurn(dagWithCosts, turnA, null);
    const resultB = filterDagForTurn(dagWithCosts, turnB, null, resultA);

    // Must be a different reference -- same agents, same main tokens, but different agent-1 tokens
    expect(resultB).not.toBe(resultA);

    // resultB must have turnB's agent-1 token data
    const agent1B = resultB!.nodes.find((n) => n.id === "agent-1")!;
    expect(agent1B.tokenUsage.inputTokens).toBe(400);
    expect(agent1B.tokenUsage.outputTokens).toBe(200);
    expect(agent1B.tokenUsage.totalCost).toBeCloseTo(0.80);
  });

  // NOTE: a "detects status change when token counts are unchanged" test
  // previously asserted that filterDagForTurn would override node.status based
  // on a summary-level status field. The AgentSummary.status field was removed
  // with the agent-status predicate refactor, and filterDagForTurn no longer
  // overrides node.status — the server DAG builder is now the authoritative
  // source for node.status (derived via isAgentCompleted server-side). The
  // filter simply passes node.status through unchanged, so the test's premise
  // is obsolete and it was removed rather than rewired.

  it("overrides startTime/endTime with turn-scoped values, widening endTime to subagent envelope", () => {
    const dagWithTimes: AgentDAG = {
      nodes: [
        { ...makeNode("main"), startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z" },
        { ...makeNode("agent-1"), startTime: "2026-01-01T00:05:00Z", endTime: "2026-01-01T00:55:00Z" },
      ],
      edges: [{ source: "main", target: "agent-1" }],
    };

    const turn: TurnSnapshot = {
      turnNumber: 5,
      promptText: "test",
      startIndex: 0,
      endIndex: 10,
      agents: [
        { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0.1, tokensIn: 100, tokensOut: 50, tools: [] },
        { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0.2, tokensIn: 200, tokensOut: 100, tools: [] },
      ],
      cost: 0.3,
      costBreakdown: { total: 0.3, inputCost: 0.2, outputCost: 0.1 },
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      durationMs: 180000,
      startTime: "2026-01-01T00:30:00Z",
      endTime: "2026-01-01T00:33:00Z",
      dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
    };

    const result = filterDagForTurn(dagWithTimes, turn, null)!;
    const mainNode = result.nodes.find((n) => n.id === "main")!;
    const agentNode = result.nodes.find((n) => n.id === "agent-1")!;

    // Root (main) gets turn startTime (turn bound wins when present).
    // Times are normalized through Date.toISOString() so the value has .000Z.
    expect(new Date(mainNode.startTime!).getTime()).toBe(new Date("2026-01-01T00:30:00Z").getTime());
    // Root endTime is widened to max(turn.endTime=00:33, groupEnd=00:55)
    // because subagent agent-1's endTime extends beyond the turn-scoped endTime.
    expect(new Date(mainNode.endTime!).getTime()).toBe(new Date("2026-01-01T00:55:00Z").getTime());
    // Child keeps its original times for accurate bar positioning
    expect(agentNode.startTime).toBe("2026-01-01T00:05:00Z");
    expect(agentNode.endTime).toBe("2026-01-01T00:55:00Z");
  });

  describe("main endTime widening", () => {
    it("T-FILTER-1 main endTime widens to include subagent that ends beyond turn.endTime", () => {
      const T = new Date("2026-01-01T00:00:00Z").getTime();
      const turnStart = new Date(T).toISOString();
      const turnEnd = new Date(T + 5 * 60_000).toISOString(); // T+5m
      const subEnd = new Date(T + 10 * 60_000).toISOString(); // T+10m

      const dagWithTimes: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart, endTime: turnEnd },
          { ...makeNode("agent-1"), startTime: turnStart, endTime: subEnd },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };
      const turn: TurnSnapshot = {
        turnNumber: 1,
        promptText: "t",
        startIndex: 0,
        endIndex: 10,
        agents: [
          { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
          { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
        ],
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: null,
        startTime: turnStart,
        endTime: turnEnd,
        dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
      };

      const result = filterDagForTurn(dagWithTimes, turn, null)!;
      const mainNode = result.nodes.find((n) => n.id === "main")!;
      // groupEnd (subagent T+10m) > turn.endTime (T+5m) → main endTime = T+10m
      expect(mainNode.endTime).toBe(subEnd);
    });

    it("T-FILTER-2 main endTime uses max when turn.endTime is later than groupEnd", () => {
      const T = new Date("2026-01-01T00:00:00Z").getTime();
      const turnStart = new Date(T).toISOString();
      const turnEnd = new Date(T + 20 * 60_000).toISOString(); // T+20m
      const subEnd = new Date(T + 10 * 60_000).toISOString(); // T+10m

      const dagWithTimes: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart, endTime: turnEnd },
          { ...makeNode("agent-1"), startTime: turnStart, endTime: subEnd },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };
      const turn: TurnSnapshot = {
        turnNumber: 1,
        promptText: "t",
        startIndex: 0,
        endIndex: 10,
        agents: [
          { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
          { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
        ],
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: null,
        startTime: turnStart,
        endTime: turnEnd,
        dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
      };

      const result = filterDagForTurn(dagWithTimes, turn, null)!;
      const mainNode = result.nodes.find((n) => n.id === "main")!;
      // turn.endTime (T+20m) > groupEnd (T+10m) → main endTime = T+20m
      expect(mainNode.endTime).toBe(turnEnd);
    });

    it("T-FILTER-3 main endTime extends to now for active subagent", () => {
      // Active subagent with no endTime — envelope should reach Date.now().
      const now = Date.now();
      const turnStart = new Date(now - 2 * 60_000).toISOString(); // 2 min ago
      const subStart = new Date(now - 2 * 60_000).toISOString();

      const dagWithTimes: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart },
          { ...makeNode("agent-1"), status: "active", startTime: subStart },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };
      const turn: TurnSnapshot = {
        turnNumber: 1,
        promptText: "t",
        startIndex: 0,
        endIndex: 10,
        agents: [
          { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
          { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0, tokensIn: 0, tokensOut: 0, tools: [] },
        ],
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: null,
        startTime: turnStart,
        endTime: "",
        dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
      };

      const result = filterDagForTurn(dagWithTimes, turn, null)!;
      const mainNode = result.nodes.find((n) => n.id === "main")!;
      // Active subagent with no endTime extends group envelope to Date.now().
      // Allow 1s tolerance for clock drift between computeGroupEnvelope and assertion.
      expect(mainNode.endTime).toBeDefined();
      const mainEndMs = new Date(mainNode.endTime!).getTime();
      expect(mainEndMs).toBeGreaterThanOrEqual(now - 1000);
      expect(mainEndMs).toBeLessThanOrEqual(Date.now() + 1000);
    });

    // P2-3: sameData memo check must include main's computed endTime. When a
    // subagent's endTime advances (group envelope grows) but tokens/status
    // remain unchanged, prev must NOT be reused — otherwise the timeline
    // "lurches" forward only when tokens happen to change.

    it("T-FILTER-4: prev result is not reused when group envelope changed", () => {
      // Turn with one completed subagent; endTime of the subagent is the
      // thing that changes between calls. Main's tokens/status are stable.
      const T = new Date("2026-01-01T00:00:00Z").getTime();
      const turnStart = new Date(T).toISOString();
      const turnEnd = new Date(T + 5 * 60_000).toISOString();
      const sub1EndA = new Date(T + 10 * 60_000).toISOString(); // T+10m
      const sub1EndB = new Date(T + 15 * 60_000).toISOString(); // T+15m (later)

      const turn: TurnSnapshot = {
        turnNumber: 1,
        promptText: "t",
        startIndex: 0,
        endIndex: 10,
        agents: [
          { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0, tokensIn: 100, tokensOut: 50, tools: [] },
          { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0, tokensIn: 200, tokensOut: 100, tools: [] },
        ],
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: null,
        startTime: turnStart,
        endTime: turnEnd,
        dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
      };

      // First DAG: subagent endTime = T+10m.
      const dagA: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart, endTime: turnEnd, tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
          { ...makeNode("agent-1"), startTime: turnStart, endTime: sub1EndA, tokenUsage: { inputTokens: 200, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };

      // Second DAG: subagent endTime now T+15m (envelope grew).
      // Tokens and status on the turn are unchanged.
      const dagB: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart, endTime: turnEnd, tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
          { ...makeNode("agent-1"), startTime: turnStart, endTime: sub1EndB, tokenUsage: { inputTokens: 200, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };

      const first = filterDagForTurn(dagA, turn, null);
      const second = filterDagForTurn(dagB, turn, null, first);

      // Envelope changed → must NOT be prev reference.
      expect(second).not.toBe(first);
      const mainB = second!.nodes.find(n => n.id === "main")!;
      expect(mainB.endTime).toBe(sub1EndB);
    });

    it("T-FILTER-5: prev result IS reused when nothing changed", () => {
      // All subagents completed with explicit endTime; no active branch → no
      // Date.now() drift → repeated calls with identical inputs must return
      // the same reference (memoization works).
      const T = new Date("2026-01-01T00:00:00Z").getTime();
      const turnStart = new Date(T).toISOString();
      const turnEnd = new Date(T + 5 * 60_000).toISOString();
      const subEnd = new Date(T + 4 * 60_000).toISOString();

      const turn: TurnSnapshot = {
        turnNumber: 1,
        promptText: "t",
        startIndex: 0,
        endIndex: 10,
        agents: [
          { agentId: "main", agentType: "main", displayName: "Main", invocationCount: 1, cost: 0, tokensIn: 100, tokensOut: 50, tools: [] },
          { agentId: "agent-1", agentType: "engineer", displayName: "eng", invocationCount: 1, cost: 0, tokensIn: 200, tokensOut: 100, tools: [] },
        ],
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: null,
        startTime: turnStart,
        endTime: turnEnd,
        dispatchedAgentIds: new Set<string>(["main", "agent-1"]),
      };

      const dag: AgentDAG = {
        nodes: [
          { ...makeNode("main"), startTime: turnStart, endTime: turnEnd, tokenUsage: { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
          { ...makeNode("agent-1"), startTime: turnStart, endTime: subEnd, tokenUsage: { inputTokens: 200, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 } },
        ],
        edges: [{ source: "main", target: "agent-1" }],
      };

      const first = filterDagForTurn(dag, turn, null);
      const second = filterDagForTurn(dag, turn, null, first);

      // Identical inputs → same reference.
      expect(second).toBe(first);
    });
  });
});
