import type { ToolGroup, ToolEntry } from "../components/conversation/ToolEntries";

export interface Phase {
  label: string;
  groups: ToolGroup[];
  status: "success" | "running" | "error";
  toolCounts: Record<string, number>;
}

const AGENT_DISPATCH_NAMES = new Set(["task", "agent"]);

/** Check if a group is an agent dispatch (Task, Agent, dispatch_agent, subagent, etc.) */
function isAgentDispatchGroup(group: ToolGroup): boolean {
  const lName = group.name.toLowerCase();
  return (
    AGENT_DISPATCH_NAMES.has(lName) ||
    lName.includes("dispatch") ||
    lName.includes("subagent")
  );
}

/** Compute phase status from groups. */
function computeStatus(groups: ToolGroup[]): Phase["status"] {
  for (const g of groups) {
    for (const e of g.entries) {
      if (e.status === "error") return "error";
    }
  }
  for (const g of groups) {
    for (const e of g.entries) {
      if (e.status === "running") return "running";
    }
  }
  return "success";
}

/** Compute tool counts from groups. */
function computeToolCounts(groups: ToolGroup[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const g of groups) {
    for (const e of g.entries) {
      counts[e.name] = (counts[e.name] || 0) + 1;
    }
  }
  return counts;
}

/** Count total entries across groups. */
function totalEntries(groups: ToolGroup[]): number {
  let n = 0;
  for (const g of groups) {
    n += g.entries.length;
  }
  return n;
}

/**
 * Infer a label for a phase.
 * Priority: thinkingContext > first Grep/Glob pattern > dominant filenames > fallback count.
 */
function inferLabel(groups: ToolGroup[], thinkingContext?: string): string {
  // 1. From thinking context
  if (thinkingContext) {
    const trimmed = thinkingContext.trim();
    if (trimmed.length > 0) {
      const sentenceEnd = trimmed.search(/[.!?\n]/);
      const firstSentence = sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd) : trimmed;
      if (firstSentence.length <= 60) return firstSentence;
      return firstSentence.slice(0, 60) + "...";
    }
  }

  // 2. From first Grep/Glob pattern
  for (const g of groups) {
    for (const e of g.entries) {
      if ((e.name === "Grep" || e.name === "Glob") && e.toolInput?.pattern) {
        const pattern = e.toolInput.pattern as string;
        const label = `Searched "${pattern}"`;
        return label.length <= 60 ? label : label.slice(0, 57) + "...";
      }
    }
  }

  // 3. From dominant file path — show filenames
  const dirCounts = new Map<string, number>();
  const filenames: string[] = [];
  for (const g of groups) {
    for (const e of g.entries) {
      const fp = (e.toolInput?.file_path as string) || (e.toolInput?.path as string) || "";
      if (fp) {
        const lastSlash = fp.lastIndexOf("/");
        const dir = lastSlash > 0 ? fp.slice(0, lastSlash) : fp;
        dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
        const basename = lastSlash > 0 ? fp.slice(lastSlash + 1) : fp;
        if (basename && !filenames.includes(basename)) filenames.push(basename);
      }
    }
  }
  if (dirCounts.size > 0) {
    let maxCount = 0;
    for (const [, count] of dirCounts) {
      if (count > maxCount) maxCount = count;
    }
    if (maxCount > totalEntries(groups) / 2 && filenames.length > 0) {
      const shown = filenames.slice(0, 3).join(", ");
      const extra = filenames.length > 3 ? ` +${filenames.length - 3} more` : "";
      const label = shown + extra;
      return label.length <= 60 ? label : label.slice(0, 57) + "...";
    }
  }

  // 4. Fallback
  return `${totalEntries(groups)} tool calls`;
}

/**
 * Group Level 1 tool groups into Level 2 phases.
 *
 * Simple rule: all consecutive non-agent tool groups → one phase.
 * Agent dispatch (Task/Agent) splits into a new phase.
 * Single-group phases are not wrapped.
 *
 * @param groups - Array of ToolGroup from groupToolEntries()
 * @param _assistantTextBoundaries - Unused (kept for API compat)
 * @param thinkingContext - Optional thinking text for label inference
 */
export function groupIntoPhases(
  groups: ToolGroup[],
  _assistantTextBoundaries?: number[],
  thinkingContext?: string,
): Phase[] {
  if (groups.length === 0) return [];

  const rawPhases: ToolGroup[][] = [];
  let currentPhase: ToolGroup[] = [];

  for (const g of groups) {
    if (isAgentDispatchGroup(g)) {
      // Agent dispatch: flush current phase, skip agent (rendered as AgentCard)
      if (currentPhase.length > 0) {
        rawPhases.push(currentPhase);
        currentPhase = [];
      }
      continue;
    }
    currentPhase.push(g);
  }
  if (currentPhase.length > 0) {
    rawPhases.push(currentPhase);
  }

  // Build phases — skip single-group (already compact as Level 1)
  const result: Phase[] = [];
  for (const phaseGroups of rawPhases) {
    if (phaseGroups.length <= 1) continue;

    result.push({
      label: inferLabel(phaseGroups, thinkingContext),
      groups: phaseGroups,
      status: computeStatus(phaseGroups),
      toolCounts: computeToolCounts(phaseGroups),
    });
  }

  return result;
}
