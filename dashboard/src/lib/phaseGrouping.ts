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

/** Extract file paths from a group's entries. */
function extractFilePaths(group: ToolGroup): Set<string> {
  const paths = new Set<string>();
  for (const e of group.entries) {
    const input = e.toolInput;
    if (input) {
      const fp = (input.file_path as string) || (input.path as string) || "";
      if (fp) paths.add(fp);
    }
  }
  return paths;
}

/**
 * Jaccard similarity between two sets.
 * Both empty → 1 (groups without file paths, e.g. Bash, should stay together).
 * One empty → 0 (one group has paths, other doesn't — treat as disjoint).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  // Iterate smaller set for efficiency
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract directory prefixes from a set of file paths. */
function extractDirs(paths: Set<string>): Set<string> {
  const dirs = new Set<string>();
  for (const p of paths) {
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash > 0) {
      dirs.add(p.slice(0, lastSlash));
    }
  }
  return dirs;
}

/** Add all file paths from a group into an existing set. Returns paths added. */
function addGroupPaths(group: ToolGroup, target: Set<string>): void {
  for (const p of extractFilePaths(group)) {
    target.add(p);
  }
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

/** Check if all groups contain only error entries. */
function allErrorGroups(groups: ToolGroup[]): boolean {
  for (const g of groups) {
    for (const e of g.entries) {
      if (e.status !== "error") return false;
    }
  }
  return true;
}

/** Check if all groups are agent dispatch. */
function allAgentGroups(groups: ToolGroup[]): boolean {
  for (const g of groups) {
    if (!isAgentDispatchGroup(g)) return false;
  }
  return true;
}

/**
 * Infer a label for a phase.
 * Priority: thinkingContext > first Grep/Glob pattern > dominant directory > fallback count.
 */
function inferLabel(groups: ToolGroup[], thinkingContext?: string): string {
  // 1. From thinking context
  if (thinkingContext) {
    const trimmed = thinkingContext.trim();
    if (trimmed.length > 0) {
      // Extract first sentence
      const sentenceEnd = trimmed.search(/[.!?\n]/);
      const firstSentence = sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd) : trimmed;
      if (firstSentence.length <= 60) return firstSentence;
      return firstSentence.slice(0, 60) + "...";
    }
  }

  // 2. From first Grep/Glob pattern in any group
  for (const g of groups) {
    for (const e of g.entries) {
      if ((e.name === "Grep" || e.name === "Glob") && e.toolInput?.pattern) {
        const pattern = e.toolInput.pattern as string;
        const label = `Searched "${pattern}"`;
        return label.length <= 60 ? label : label.slice(0, 57) + "...";
      }
    }
  }

  // 3. From dominant file path (most common directory prefix)
  const dirCounts = new Map<string, number>();
  const filenames: string[] = [];
  for (const g of groups) {
    for (const e of g.entries) {
      const fp = (e.toolInput?.file_path as string) || (e.toolInput?.path as string) || "";
      if (fp) {
        const lastSlash = fp.lastIndexOf("/");
        const dir = lastSlash > 0 ? fp.slice(0, lastSlash) : fp;
        dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
        // Collect unique basenames for label
        const basename = lastSlash > 0 ? fp.slice(lastSlash + 1) : fp;
        if (basename && !filenames.includes(basename)) filenames.push(basename);
      }
    }
  }
  if (dirCounts.size > 0) {
    let maxDir = "";
    let maxCount = 0;
    for (const [dir, count] of dirCounts) {
      if (count > maxCount) {
        maxDir = dir;
        maxCount = count;
      }
    }
    // Only use dir label if it covers majority of entries
    const total = totalEntries(groups);
    if (maxCount > total / 2 && maxDir) {
      // Show top filenames instead of raw directory path
      if (filenames.length > 0) {
        const shown = filenames.slice(0, 3).join(", ");
        const extra = filenames.length > 3 ? ` +${filenames.length - 3} more` : "";
        const label = shown + extra;
        return label.length <= 60 ? label : label.slice(0, 57) + "...";
      }
      // Fallback: truncate to last 2 path segments
      const segments = maxDir.split("/").filter(Boolean);
      const shortDir = segments.slice(-2).join("/");
      return shortDir;
    }
  }

  // 4. Fallback: "{N} tool calls"
  return `${totalEntries(groups)} tool calls`;
}

/**
 * Group Level 1 tool groups into Level 2 semantic phases.
 *
 * @param groups - Array of ToolGroup from groupToolEntries()
 * @param assistantTextBoundaries - Optional indices where assistant text occurs (splits sections)
 * @param thinkingContext - Optional thinking text preceding the phase (used for label inference)
 * @returns Array of Phase objects. Single-group phases and agent-only phases are excluded.
 */
export function groupIntoPhases(
  groups: ToolGroup[],
  assistantTextBoundaries?: number[],
  thinkingContext?: string,
): Phase[] {
  if (groups.length === 0) return [];

  // Step 1: Filter out agent dispatch groups and record their positions
  const nonAgentGroups: Array<{ group: ToolGroup; originalIndex: number }> = [];
  for (let i = 0; i < groups.length; i++) {
    if (!isAgentDispatchGroup(groups[i])) {
      nonAgentGroups.push({ group: groups[i], originalIndex: i });
    }
  }

  if (nonAgentGroups.length === 0) return [];

  // Step 2: Build boundary set from assistant text boundaries and agent dispatch positions
  const boundaryIndices = new Set<number>();
  if (assistantTextBoundaries) {
    for (const idx of assistantTextBoundaries) {
      boundaryIndices.add(idx);
    }
  }
  // Agent dispatch groups also create boundaries
  for (let i = 0; i < groups.length; i++) {
    if (isAgentDispatchGroup(groups[i])) {
      boundaryIndices.add(i);
    }
  }

  // Step 3: Split non-agent groups into sections at boundaries, then detect file-set disjunction
  const rawPhases: ToolGroup[][] = [];
  // hardBoundaryAfter[i] = true means a hard boundary exists AFTER rawPhases[i],
  // i.e., between rawPhases[i] and rawPhases[i+1]. Hard boundaries come from
  // assistant text gaps / agent dispatch. Soft boundaries come from Jaccard splits.
  const hardBoundaryAfter: boolean[] = [];
  let currentPhase: ToolGroup[] = [];
  let phasePaths = new Set<string>(); // Maintained incrementally — O(1) per group

  for (let ni = 0; ni < nonAgentGroups.length; ni++) {
    const { group: g, originalIndex } = nonAgentGroups[ni];

    // Check if this group's original index crosses a boundary
    if (currentPhase.length > 0 && boundaryIndices.has(originalIndex)) {
      rawPhases.push(currentPhase);
      hardBoundaryAfter.push(true);
      currentPhase = [g];
      phasePaths = new Set<string>();
      addGroupPaths(g, phasePaths);
      continue;
    }

    // Check if any boundary exists between previous group and this one
    if (currentPhase.length > 0 && ni > 0) {
      const prevOrigIndex = nonAgentGroups[ni - 1].originalIndex;
      let hasBoundaryBetween = false;
      for (let bi = prevOrigIndex + 1; bi < originalIndex; bi++) {
        if (boundaryIndices.has(bi)) {
          hasBoundaryBetween = true;
          break;
        }
      }
      if (hasBoundaryBetween) {
        rawPhases.push(currentPhase);
        hardBoundaryAfter.push(true);
        currentPhase = [g];
        phasePaths = new Set<string>();
        addGroupPaths(g, phasePaths);
        continue;
      }
    }

    // Check file-set disjunction via Jaccard similarity
    if (currentPhase.length > 0) {
      const newPaths = extractFilePaths(g);

      // Only split on disjunction if both sides have file paths
      if (phasePaths.size > 0 && newPaths.size > 0) {
        const similarity = jaccardSimilarity(phasePaths, newPaths);
        if (similarity < 0.1) {
          // Fall back to directory-level similarity before splitting
          const phaseDirs = extractDirs(phasePaths);
          const newDirs = extractDirs(newPaths);
          const dirSimilarity = jaccardSimilarity(phaseDirs, newDirs);
          if (dirSimilarity < 0.3) {
            rawPhases.push(currentPhase);
            hardBoundaryAfter.push(false); // soft boundary
            currentPhase = [g];
            phasePaths = new Set<string>();
            addGroupPaths(g, phasePaths);
            continue;
          }
        }
      }
    }

    currentPhase.push(g);
    addGroupPaths(g, phasePaths);
  }
  if (currentPhase.length > 0) {
    rawPhases.push(currentPhase);
  }

  // Step 4: Small-phase absorption (Fix 3)
  // Absorb phases with <= 3 total entries into adjacent phase when files overlap.
  // Only absorb across soft boundaries (Jaccard splits), not hard boundaries
  // (assistant text / agent dispatch).
  for (let i = 0; i < rawPhases.length; i++) {
    const phase = rawPhases[i];
    if (totalEntries(phase) <= 3) {
      const smallPhasePaths = new Set<string>();
      for (const g of phase) {
        for (const p of extractFilePaths(g)) smallPhasePaths.add(p);
      }
      if (smallPhasePaths.size === 0) continue; // No file paths to compare

      // Try merging with previous phase (only across soft boundaries)
      if (i > 0 && !hardBoundaryAfter[i - 1]) {
        const prevPhase = rawPhases[i - 1];
        const prevPaths = new Set<string>();
        for (const g of prevPhase) {
          for (const p of extractFilePaths(g)) prevPaths.add(p);
        }
        if (jaccardSimilarity(smallPhasePaths, prevPaths) > 0) {
          prevPhase.push(...phase);
          rawPhases.splice(i, 1);
          hardBoundaryAfter.splice(i - 1, 1);
          i--;
          continue;
        }
      }

      // Try merging with next phase (only across soft boundaries)
      if (i < rawPhases.length - 1 && !hardBoundaryAfter[i]) {
        const nextPhase = rawPhases[i + 1];
        const nextPaths = new Set<string>();
        for (const g of nextPhase) {
          for (const p of extractFilePaths(g)) nextPaths.add(p);
        }
        if (jaccardSimilarity(smallPhasePaths, nextPaths) > 0) {
          nextPhase.unshift(...phase);
          rawPhases.splice(i, 1);
          hardBoundaryAfter.splice(i, 1);
          i--;
          continue;
        }
      }
    }
  }

  // Step 5: Filter out unwrappable phases
  const result: Phase[] = [];
  for (const phaseGroups of rawPhases) {
    // Skip single-group phases
    if (phaseGroups.length <= 1) continue;
    // Skip all-error phases
    if (allErrorGroups(phaseGroups)) continue;
    // Skip all-agent phases (shouldn't happen since we filtered, but safety check)
    if (allAgentGroups(phaseGroups)) continue;

    result.push({
      label: inferLabel(phaseGroups, thinkingContext),
      groups: phaseGroups,
      status: computeStatus(phaseGroups),
      toolCounts: computeToolCounts(phaseGroups),
    });
  }

  return result;
}
