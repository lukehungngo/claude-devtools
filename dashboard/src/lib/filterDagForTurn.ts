import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

/**
 * Filter a full session DAG to only the agents present in a given turn.
 * Returns the full DAG when:
 * - dag is null (returns null)
 * - activeTurn is undefined (returns full dag)
 * - activeTurn has no agents yet (brand-new turn -- returns full dag)
 *
 * Accepts an optional `prev` result. If the agent ID set AND token data
 * are unchanged, returns `prev` (same reference) to avoid React re-renders.
 *
 * When filtering for a turn, each node's tokenUsage is overridden with
 * turn-specific data from the turn's AgentSummary (which computes cost
 * from each agent's own token consumption × model pricing).
 */
export function filterDagForTurn(
  dag: AgentDAG | null,
  activeTurn: TurnSnapshot | undefined,
  prev?: AgentDAG | null,
): AgentDAG | null {
  if (!dag || !activeTurn) return dag;
  // If the turn has no agents yet (brand-new turn), show full DAG
  if (activeTurn.agents.length === 0) return dag;

  const turnAgentIds = new Set(activeTurn.agents.map((a) => a.agentId));
  turnAgentIds.add("main");

  // Build lookup from turn's agent summaries (includes "main" agent)
  const agentSummaryMap = new Map(activeTurn.agents.map((a) => [a.agentId, a]));

  // Check if agent set AND data are unchanged from previous result
  if (prev && prev !== dag) {
    const prevIds = prev.nodes.map((n) => n.id).sort().join(",");
    const newIds = Array.from(turnAgentIds).sort().join(",");
    // Compare ALL nodes' token data against turn summaries; if any node's
    // tokens differ from the summary, data has changed and we must recompute
    const sameData = prev.nodes.every((n) => {
      const summary = agentSummaryMap.get(n.id);
      if (!summary) return true; // node not in this turn's summary, skip
      const dagStatus = summary.status === "running" ? "active" : summary.status;
      return n.tokenUsage.inputTokens === summary.tokensIn
        && n.tokenUsage.outputTokens === summary.tokensOut
        && n.status === dagStatus;
    });
    if (prevIds === newIds && sameData) return prev;
  }

  const nodes = dag.nodes
    .filter((n) => turnAgentIds.has(n.id))
    .map((n): AgentNode => {
      // Override cost with turn-specific values from AgentSummary
      // Each agent's cost is computed from its own tokens × model pricing
      const summary = agentSummaryMap.get(n.id);
      // Only override the root node's time bounds to scope the timeline
      // to the turn.  Child nodes keep their original times so their
      // bars reflect actual relative positioning within the turn.
      const isRoot = n.id === "main";
      const timeOverrides = isRoot
        ? { startTime: activeTurn.startTime || n.startTime, endTime: activeTurn.endTime || n.endTime }
        : {};
      if (summary) {
        const dagStatus = summary.status === "running" ? "active" : summary.status;
        return {
          ...n,
          ...timeOverrides,
          status: dagStatus,
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
