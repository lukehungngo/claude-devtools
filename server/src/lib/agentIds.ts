/**
 * Synthetic agent IDs — mirrors dashboard/src/lib/agentIds.ts.
 *
 * Both copies MUST stay in sync. The constant is duplicated rather than
 * imported across packages because the repo has no shared package today.
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
