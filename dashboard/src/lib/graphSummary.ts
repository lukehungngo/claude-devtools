import type { AgentDAG } from "./types";

/** Per-type node count for the graph legend. */
export interface TypeCount {
  type: string;
  count: number;
}

/**
 * A summary of the current agent graph for the on-canvas overlay.
 *
 * `running` / `finished` mirror the node's 2-mode display model: a node is
 * "running" iff its id is in `runningAgentIds` (server status "active"), and
 * `errored` counts not-running nodes whose status is "error" so failed agents
 * are surfaced, not hidden inside "finished". `finished` is the clean remainder
 * (total - running - errored). Matches the node's running|finished|error modes.
 */
export interface GraphSummary {
  total: number;
  running: number;
  finished: number;
  errored: number;
  byType: TypeCount[];
}

/**
 * Summarize a dag into total / running / finished / errored + a per-type
 * breakdown. Pure and deterministic. O(nodes).
 */
export function summarizeDag(
  dag: AgentDAG,
  runningAgentIds: ReadonlySet<string>,
): GraphSummary {
  const total = dag.nodes.length;

  let running = 0;
  let errored = 0;
  const typeCounts = new Map<string, number>();
  for (const n of dag.nodes) {
    if (runningAgentIds.has(n.id)) running += 1;
    else if (n.status === "error") errored += 1;
    typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1);
  }

  const byType: TypeCount[] = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (b.count - a.count) || a.type.localeCompare(b.type));

  return { total, running, errored, finished: total - running - errored, byType };
}
