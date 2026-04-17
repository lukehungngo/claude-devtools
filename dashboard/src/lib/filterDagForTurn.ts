import type { AgentDAG, AgentNode } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";

/** Window, in ms, used to decide whether an active subagent should extend the timeline to now. */
const RECENT_MS = 5 * 60_000;

/**
 * Parse an ISO timestamp; return null if the string is empty, invalid, or NaN.
 * Treat empty strings as absent rather than epoch (Date("").getTime() === NaN,
 * but `new Date("") | 0` would silently become 0).
 */
function parseTimeMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Compute the wall-clock envelope of the turn's real subagents (excluding main).
 * - groupStart: min(startTime) over filtered subagent nodes
 * - groupEnd: max(endTime) over filtered subagent nodes, extended to Date.now()
 *   if any subagent is "active" and genuinely running (last event within RECENT_MS
 *   of now OR no endTime at all).
 *
 * Excluding main is intentional: main's original endTime is session-wide and
 * would swamp the turn-scoped envelope. We want the envelope of work dispatched
 * during the turn.
 */
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
      // Active subagent: extend to now only if recent or no endTime.
      // Stale active (endMs exists but >RECENT_MS old) uses its own endTime.
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
 *
 * Main's time bounds are widened to max(activeTurn.endTime, groupEnd),
 * where groupEnd is the convex-hull end of the turn's subagents. This keeps
 * main's row spanning the full turn including any subagent work that extends
 * beyond the turn-scoped endTime (e.g., a long-running tool call).
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

  // Filter nodes first so we can compute the subagent envelope from the same set.
  const filteredNodes = dag.nodes.filter((n) => turnAgentIds.has(n.id));
  const subagentNodes = filteredNodes.filter((n) => n.id !== "main");
  const { groupStart, groupEnd } = computeGroupEnvelope(subagentNodes);

  // Compute main's widened time override once; reused for every main-node path below.
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

  // Resolve what the NEW render would write as main's endTime. Same logic
  // used below when building the nodes array; precomputed here so the memo
  // check can include it (P2-3: envelope-change must invalidate prev).
  const originalMain = dag.nodes.find((n) => n.id === "main");
  const newMainEndTime =
    mainEndMs !== null ? new Date(mainEndMs).toISOString() : originalMain?.endTime;

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
    // P2-3: also compare main's previously-written endTime with what a fresh
    // render would produce. If the subagent envelope advanced (e.g., a
    // subagent's endTime moved forward while tokens were unchanged), prev
    // is stale — force recompute so the timeline doesn't freeze until the
    // next token/status change.
    const prevMainEnd = prev.nodes.find((n) => n.id === "main")?.endTime;
    const sameMainEnd = prevMainEnd === newMainEndTime;
    if (prevIds === newIds && sameData && sameMainEnd) return prev;
  }

  const nodes = filteredNodes.map((n): AgentNode => {
      // Override cost with turn-specific values from AgentSummary
      // Each agent's cost is computed from its own tokens × model pricing
      const summary = agentSummaryMap.get(n.id);
      // Only override the root node's time bounds to scope the timeline
      // to the turn.  Child nodes keep their original times so their
      // bars reflect actual relative positioning within the turn.
      const isRoot = n.id === "main";
      const timeOverrides: Partial<AgentNode> = {};
      if (isRoot) {
        timeOverrides.startTime =
          mainStartMs !== null ? new Date(mainStartMs).toISOString() : n.startTime;
        timeOverrides.endTime =
          mainEndMs !== null ? new Date(mainEndMs).toISOString() : n.endTime;
      }
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
