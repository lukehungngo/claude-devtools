import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

/**
 * Filter a full session DAG to only the agents present in a given turn.
 * Returns the full DAG when:
 * - dag is null (returns null)
 * - activeTurn is undefined (returns full dag)
 * - activeTurn has no agents yet (brand-new turn -- returns full dag)
 *
 * Accepts an optional `prev` result. If the agent ID set is unchanged,
 * returns `prev` (same reference) to avoid unnecessary React re-renders.
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

  // Check if agent set is unchanged from previous result
  if (prev && prev !== dag) {
    const prevIds = prev.nodes.map((n) => n.id).sort().join(",");
    const newIds = Array.from(turnAgentIds).sort().join(",");
    if (prevIds === newIds) return prev;
  }

  // Build lookup from turn's agent summaries (includes "main" agent)
  const agentSummaryMap = new Map(activeTurn.agents.map((a) => [a.agentId, a]));

  const nodes = dag.nodes
    .filter((n) => turnAgentIds.has(n.id))
    .map((n): AgentNode => {
      // Override cost with turn-specific values from AgentSummary
      // Each agent's cost is computed from its own tokens × model pricing
      const summary = agentSummaryMap.get(n.id);
      if (summary) {
        return {
          ...n,
          // Override time bounds with turn-scoped values so duration
          // reflects the turn, not the entire session
          startTime: activeTurn.startTime || n.startTime,
          endTime: activeTurn.endTime || n.endTime,
          tokenUsage: {
            ...n.tokenUsage,
            inputTokens: summary.tokensIn,
            outputTokens: summary.tokensOut,
            totalCost: summary.cost,
          },
          toolCalls: summary.tools.length,
        };
      }
      // Nodes without a summary still need turn-scoped time bounds
      return {
        ...n,
        startTime: activeTurn.startTime || n.startTime,
        endTime: activeTurn.endTime || n.endTime,
      };
    });

  return {
    nodes,
    edges: dag.edges.filter(
      (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target),
    ),
  };
}
