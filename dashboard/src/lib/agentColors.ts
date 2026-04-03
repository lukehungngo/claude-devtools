/**
 * Agent type color system.
 * Fixed colors for well-known agent types.
 * Deterministic HSL color generation for unknown types.
 */

/** Fixed colors for well-known agent types */
const KNOWN_COLORS: Record<string, string> = {
  main: "var(--accent)",
  Explore: "var(--cyan)",
  Plan: "var(--yellow)",
  "general-purpose": "var(--green)",
  General: "var(--green)",
  orchestrator: "var(--orange)",
  engineer: "var(--teal)",
  reviewer: "var(--purple)",
  "bug-fixer": "var(--rose)",
  researcher: "var(--sky)",
  "differential-reviewer": "var(--pink)",
  "ui-ux-designer": "var(--pink)",
};

/** Fixed dim colors for well-known agent types (used in badges) */
const KNOWN_DIM_COLORS: Record<string, string> = {
  main: "var(--accent-dim)",
  Explore: "var(--cyan-dim)",
  Plan: "var(--yellow-dim)",
  "general-purpose": "var(--green-dim)",
  General: "var(--green-dim)",
  orchestrator: "var(--orange-dim)",
  engineer: "var(--teal-dim)",
  reviewer: "var(--purple-dim)",
  "bug-fixer": "var(--rose-dim)",
  researcher: "var(--sky-dim)",
  "differential-reviewer": "var(--pink-dim)",
  "ui-ux-designer": "var(--pink-dim)",
};

/** Simple string hash → number */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Generate a deterministic HSL color from an agent type string.
 *  Uses CSS light-dark() for theme adaptation. */
function generateColor(agentType: string): string {
  const h = hashString(agentType) % 360;
  return `light-dark(hsl(${h}, 55%, 40%), hsl(${h}, 70%, 65%))`;
}

function generateDimColor(agentType: string): string {
  const h = hashString(agentType) % 360;
  return `light-dark(hsla(${h}, 55%, 40%, 0.08), hsla(${h}, 70%, 65%, 0.15))`;
}

// Cache generated colors so they're stable across renders
const colorCache = new Map<string, string>();
const dimColorCache = new Map<string, string>();

/**
 * Normalize agent type for color lookup.
 * Strips plugin prefixes like "mas:engineer:engineer" → "engineer",
 * "mas:differential-reviewer:differential-reviewer" → "differential-reviewer".
 */
function normalizeForLookup(agentType: string): string {
  // Strip "mas:xxx:" or similar plugin prefixes — take the last colon-segment
  if (agentType.includes(":")) {
    return agentType.split(":").pop()!;
  }
  return agentType;
}

/** Get border/text color for an agent type */
export function getAgentColor(agentType: string): string {
  const normalized = normalizeForLookup(agentType);
  if (KNOWN_COLORS[normalized]) return KNOWN_COLORS[normalized];
  if (KNOWN_COLORS[agentType]) return KNOWN_COLORS[agentType];
  if (!colorCache.has(agentType)) {
    colorCache.set(agentType, generateColor(agentType));
  }
  return colorCache.get(agentType)!;
}

/** Get dim/background color for an agent type */
export function getAgentDimColor(agentType: string): string {
  const normalized = normalizeForLookup(agentType);
  if (KNOWN_DIM_COLORS[normalized]) return KNOWN_DIM_COLORS[normalized];
  if (KNOWN_DIM_COLORS[agentType]) return KNOWN_DIM_COLORS[agentType];
  if (!dimColorCache.has(agentType)) {
    dimColorCache.set(agentType, generateDimColor(agentType));
  }
  return dimColorCache.get(agentType)!;
}

/** Get badge style (background + color) for an agent type */
export function getAgentBadgeStyle(agentType: string): {
  background: string;
  color: string;
} {
  return {
    background: getAgentDimColor(agentType),
    color: getAgentColor(agentType),
  };
}

