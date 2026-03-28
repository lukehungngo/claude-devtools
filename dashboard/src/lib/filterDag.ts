import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

const FALLBACK_MAIN_NODE: AgentNode = {
  id: "main",
  type: "main",
  description: "Main session",
  tokenUsage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
  toolCalls: 0,
  mcpToolCalls: 0,
  status: "active",
};

/**
 * Filter a session-level DAG to show only agents relevant to the active turn.
 * STRUCTURAL GUARANTEE: the "main" node is always present in the result,
 * regardless of timing, race conditions, or data mismatches.
 */
export function filterDagForTurn(
  dag: AgentDAG,
  activeTurn: TurnSnapshot,
  isLiveTurn: boolean,
): AgentDAG {
  const agentIds = new Set(activeTurn.agents.map((a) => a.agentId));
  agentIds.add("main");

  if (isLiveTurn) {
    for (const n of dag.nodes) {
      if (n.status === "active") agentIds.add(n.id);
    }
  }

  const turnStatusMap = new Map(
    activeTurn.agents.map((a) => [a.agentId, a.status])
  );

  let nodes = dag.nodes
    .filter((n) => agentIds.has(n.id))
    .map((n) => {
      const turnStatus = turnStatusMap.get(n.id);
      if (turnStatus) {
        return { ...n, status: turnStatus === "error" ? "error" as const : turnStatus === "running" ? "active" as const : "completed" as const };
      }
      return n;
    });

  // STRUCTURAL GUARANTEE: main node must always be present.
  if (!nodes.some((n) => n.id === "main")) {
    const mainFromDag = dag.nodes.find((n) => n.id === "main");
    nodes = [mainFromDag ?? FALLBACK_MAIN_NODE, ...nodes];
  }

  return {
    nodes,
    edges: dag.edges.filter(
      (e) => agentIds.has(e.source) && agentIds.has(e.target),
    ),
  };
}
