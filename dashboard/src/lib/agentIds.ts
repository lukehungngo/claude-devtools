/**
 * Synthetic agent IDs for subagent dispatches that have no own events.
 *
 * In Claude Code variants where the `Agent` tool dispatches subagents but they
 * don't emit sidechain events into the parent JSONL, we synthesize an agentId
 * from the dispatching `tool_use.id` so the DAG can still represent the
 * dispatch as a first-class node.
 *
 * Verified ground truth (Phase 3 spec):
 *  - 478 Agent tool dispatches across 21 sessions
 *  - 0/199k sidechain events
 *  - 22/22 dispatches in the screenshot session had a matching tool_result
 *    keyed by tool_use_id
 */
export const SYNTHETIC_AGENT_PREFIX = "synthetic:agent:";

export function isSyntheticAgentId(id: string): boolean {
  return id.startsWith(SYNTHETIC_AGENT_PREFIX);
}

export function syntheticToToolUseId(id: string): string | null {
  if (!isSyntheticAgentId(id)) return null;
  return id.slice(SYNTHETIC_AGENT_PREFIX.length);
}

export function toolUseIdToSyntheticAgent(toolUseId: string): string {
  return `${SYNTHETIC_AGENT_PREFIX}${toolUseId}`;
}
