import type { AgentDAG } from "./types";
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

  return {
    nodes: dag.nodes.filter((n) => turnAgentIds.has(n.id)),
    edges: dag.edges.filter(
      (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target),
    ),
  };
}
