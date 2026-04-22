import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

/** Window, in ms, used to decide whether an active subagent should extend the timeline to now. */
const RECENT_MS = 5 * 60_000;

function parseTimeMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function computeGroupEnvelope(subagents: AgentNode[]): { groupStart: number | null; groupEnd: number | null } {
  let groupStart: number | null = null;
  let groupEnd: number | null = null;
  const now = Date.now();

  for (const n of subagents) {
    const startMs = parseTimeMs(n.startTime);
    if (startMs !== null) {
      if (groupStart === null || startMs < groupStart) groupStart = startMs;
    }

    const endMs = parseTimeMs(n.endTime);
    if (n.status === "active") {
      if (endMs === null || now - endMs < RECENT_MS) {
        if (groupEnd === null || now > groupEnd) groupEnd = now;
      } else if (groupEnd === null || endMs > groupEnd) {
        groupEnd = endMs;
      }
    } else if (endMs !== null) {
      if (groupEnd === null || endMs > groupEnd) groupEnd = endMs;
    }
  }

  return { groupStart, groupEnd };
}

/**
 * Filter a full session DAG to only the agents present in a given turn.
 *
 * Agent membership is determined by `eventAgentIds` — the set of agentIds
 * extracted from the turn's events. This matches how the Agent Log tab
 * determines which agents to display. When `eventAgentIds` is null (no
 * events available), falls back to `activeTurn.agents`.
 *
 * Token/cost data is overridden with turn-specific values from
 * `activeTurn.agents` (AgentSummary) when available.
 *
 * Main's time bounds are widened to max(activeTurn.endTime, groupEnd).
 */
export function filterDagForTurn(
  dag: AgentDAG | null,
  activeTurn: TurnSnapshot | undefined,
  eventAgentIds: Set<string> | null,
  prev?: AgentDAG | null,
): AgentDAG | null {
  if (!dag || !activeTurn) return dag;

  // Determine which agents belong to this turn.
  // Primary: event-derived IDs (same source as Agent Log).
  // Fallback: TurnSnapshot.agents (dispatch-based).
  const turnAgentIds = new Set<string>();
  turnAgentIds.add("main");

  if (eventAgentIds && eventAgentIds.size > 0) {
    for (const id of eventAgentIds) turnAgentIds.add(id);
  } else {
    for (const a of activeTurn.agents) turnAgentIds.add(a.agentId);
  }

  // If only main is present, return a single-node DAG with turn-specific data
  const turnHasSubagents = turnAgentIds.size > 1;
  if (!turnHasSubagents) {
    const mainNode = dag.nodes.find((n) => n.id === "main");
    if (!mainNode) return dag;
    const summary = activeTurn.agents.find((a) => a.agentId === "main");
    const filtered: AgentNode = summary
      ? {
          ...mainNode,
          startTime: activeTurn.startTime || mainNode.startTime,
          endTime: activeTurn.endTime || mainNode.endTime,
          tokenUsage: {
            ...mainNode.tokenUsage,
            inputTokens: summary.tokensIn,
            outputTokens: summary.tokensOut,
            totalCost: summary.cost,
          },
          toolCalls: summary.tools.length,
        }
      : mainNode;
    return { nodes: [filtered], edges: [] };
  }

  const agentSummaryMap = new Map(activeTurn.agents.map((a) => [a.agentId, a]));

  const filteredNodes = dag.nodes.filter((n) => turnAgentIds.has(n.id));
  const subagentNodes = filteredNodes.filter((n) => n.id !== "main");
  const { groupStart, groupEnd } = computeGroupEnvelope(subagentNodes);

  const turnStartMs = parseTimeMs(activeTurn.startTime);
  const turnEndMs = parseTimeMs(activeTurn.endTime);
  const mainStartMs =
    turnStartMs !== null
      ? turnStartMs
      : groupStart !== null
        ? groupStart
        : null;
  const mainEndCandidates: number[] = [];
  if (turnEndMs !== null) mainEndCandidates.push(turnEndMs);
  if (groupEnd !== null) mainEndCandidates.push(groupEnd);
  const mainEndMs = mainEndCandidates.length > 0 ? Math.max(...mainEndCandidates) : null;

  const originalMain = dag.nodes.find((n) => n.id === "main");
  const newMainEndTime =
    mainEndMs !== null ? new Date(mainEndMs).toISOString() : originalMain?.endTime;

  if (prev && prev !== dag) {
    const prevIds = prev.nodes.map((n) => n.id).sort().join(",");
    const newIds = Array.from(turnAgentIds).sort().join(",");
    const sameData = prev.nodes.every((n) => {
      const summary = agentSummaryMap.get(n.id);
      if (!summary) return true;
      return n.tokenUsage.inputTokens === summary.tokensIn
        && n.tokenUsage.outputTokens === summary.tokensOut;
    });
    const prevMainEnd = prev.nodes.find((n) => n.id === "main")?.endTime;
    const sameMainEnd = prevMainEnd === newMainEndTime;
    if (prevIds === newIds && sameData && sameMainEnd) return prev;
  }

  const nodes = filteredNodes.map((n): AgentNode => {
      const summary = agentSummaryMap.get(n.id);
      const isRoot = n.id === "main";
      const timeOverrides: Partial<AgentNode> = {};
      if (isRoot) {
        timeOverrides.startTime =
          mainStartMs !== null ? new Date(mainStartMs).toISOString() : n.startTime;
        timeOverrides.endTime =
          mainEndMs !== null ? new Date(mainEndMs).toISOString() : n.endTime;
      }
      if (summary) {
        return {
          ...n,
          ...timeOverrides,
          tokenUsage: {
            ...n.tokenUsage,
            inputTokens: summary.tokensIn,
            outputTokens: summary.tokensOut,
            totalCost: summary.cost,
          },
          toolCalls: summary.tools.length,
        };
      }
      return { ...n, ...timeOverrides };
    });

  return {
    nodes,
    edges: dag.edges.filter(
      (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target),
    ),
  };
}
