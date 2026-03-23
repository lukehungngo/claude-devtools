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

/** Generate a deterministic HSL color from an agent type string */
function generateColor(agentType: string): string {
  const h = hashString(agentType) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function generateDimColor(agentType: string): string {
  const h = hashString(agentType) % 360;
  return `hsla(${h}, 70%, 60%, 0.12)`;
}

// Cache generated colors so they're stable across renders
const colorCache = new Map<string, string>();
const dimColorCache = new Map<string, string>();

/** Get border/text color for an agent type */
export function getAgentColor(agentType: string): string {
  if (KNOWN_COLORS[agentType]) return KNOWN_COLORS[agentType];
  if (!colorCache.has(agentType)) {
    colorCache.set(agentType, generateColor(agentType));
  }
  return colorCache.get(agentType)!;
}

/** Get dim/background color for an agent type */
export function getAgentDimColor(agentType: string): string {
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

/** Legend entries: fixed known types only (used in graph legend) */
export const LEGEND_ENTRIES: ReadonlyArray<[string, string]> = [
  ["Main", KNOWN_COLORS.main],
  ["Explore", KNOWN_COLORS.Explore],
  ["Plan", KNOWN_COLORS.Plan],
  ["General", KNOWN_COLORS.General],
  ["Orchestrator", KNOWN_COLORS.orchestrator],
  ["Engineer", KNOWN_COLORS.engineer],
  ["Reviewer", KNOWN_COLORS.reviewer],
  ["Bug-fixer", KNOWN_COLORS["bug-fixer"]],
  ["Researcher", KNOWN_COLORS.researcher],
];
