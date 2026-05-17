import type { PatternResult, Hint } from "./types.js";

export function rankAndFormat(results: PatternResult[], range: string): Hint[] {
  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((r) => ({
      id: `${r.category}-${range}`,
      category: r.category,
      icon: r.icon,
      punchline: r.punchline,
      impact: r.impact,
      trend: "new" as const,
      drilldownAvailable: r.evidence.sessions.length > 0,
    }));
}
