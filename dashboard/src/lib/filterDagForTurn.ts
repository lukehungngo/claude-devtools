import type { AgentDAG } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

/**
 * Filter a full session DAG to only the agents present in a given turn.
 * Returns the full DAG when:
 * - dag is null (returns null)
 * - activeTurn is undefined (returns full dag)
 * - activeTurn has no agents yet (brand-new turn — returns full dag)
 *
 * This prevents graph nodes from disappearing when the user sends a new
 * prompt and the latest turn has zero agents populated yet.
 */
export function filterDagForTurn(
  dag: AgentDAG | null,
  activeTurn: TurnSnapshot | undefined,
): AgentDAG | null {
  if (!dag || !activeTurn) return dag;
  // If the turn has no agents yet (brand-new turn), show full DAG
  if (activeTurn.agents.length === 0) return dag;
  const turnAgentIds = new Set(activeTurn.agents.map((a) => a.agentId));
  turnAgentIds.add("main");
  return {
    nodes: dag.nodes.filter((n) => turnAgentIds.has(n.id)),
    edges: dag.edges.filter(
      (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target),
    ),
  };
}
