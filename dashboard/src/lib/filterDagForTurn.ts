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
 * Filter a full session DAG to only the agents dispatched in a given turn.
 *
 * Uses TurnSnapshot.dispatchedAgentIds as the membership source. This set
 * is built from parent_tool_use_id, description matching, and temporal
 * proximity — it identifies which agents were actually dispatched within
 * the turn. Unlike eventAgentIds (which includes every agentId from events
 * in the turn window), dispatchedAgentIds is immune to cross-turn subagent
 * leaks caused by timestamp-sorted event merging.
 *
 * When the turn has no subagents, returns a single-node DAG with just main
 * and turn-specific token data.
 *
 * Token/cost overrides still come from activeTurn.agents (AgentSummary).
 * Agents in dispatchedAgentIds but absent from the agents array appear in
 * the DAG with session-wide tokenUsage (no turn-scoped override).
 */
export function filterDagForTurn(
  dag: AgentDAG | null,
  activeTurn: TurnSnapshot | undefined,
  prev?: AgentDAG | null,
): AgentDAG | null {
  if (!dag || !activeTurn) return dag;

  const turnAgentIds = new Set(activeTurn.dispatchedAgentIds);
  // Defensive: ensure "main" is always present even if dispatchedAgentIds was
  // constructed without it (e.g. test fixtures). The builders always seed
  // with "main", but this guard prevents subtle breakage if the invariant
  // is ever violated upstream.
  turnAgentIds.add("main");

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
    // tokens differ from the summary, data has changed and we must recompute.
    // Status comparison is intentionally omitted: AgentSummary no longer carries
    // a stored `status` field (removed with the agent-status predicate refactor).
    // Status flips on a node now always coincide with an event append, which
    // advances a turn's endIndex — the token/endTime comparisons below plus
    // React's turn-reference equality upstream capture invalidation without a
    // per-memo O(n) predicate scan.
    const sameData = prev.nodes.every((n) => {
      const summary = agentSummaryMap.get(n.id);
      if (!summary) return true; // node not in this turn's summary, skip
      return n.tokenUsage.inputTokens === summary.tokensIn
        && n.tokenUsage.outputTokens === summary.tokensOut;
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
        // Status is no longer carried on AgentSummary — the DAG builder on the
        // server is the authoritative source for node.status (derived via
        // isAgentCompleted on the server). We pass it through unchanged.
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
