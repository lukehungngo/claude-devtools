import { describe, it, expect } from "vitest";
import { buildDiagnostics, rankAndFormat, rankQuickWins } from "../hint-ranker.js";
import type { QuickWinPattern, QuickWinResult } from "../types.js";

function makeResult(pattern: QuickWinPattern, detected: boolean, impact: number): QuickWinResult {
  return {
    id: pattern,
    pattern,
    status: "warn",
    category: "quality",
    severity: "medium",
    confidence: "high",
    detected,
    impact,
    title: `${pattern} title`,
    icon: "test",
    punchline: `${pattern} punchline`,
    impactLabel: "Quality risk",
    impactValue: "impact value",
    recommendation: "fix it",
    rule: "test rule",
    evidence: { sessions: [{ id: "s1", detail: "test", cost: 0 }], recommendation: "fix it", stats: {}, chips: ["chip"] },
  };
}

describe("rankAndFormat", () => {
  it("filters out non-detected results", () => {
    const results = [
      makeResult("edit_rejection_rate", false, 10),
      makeResult("tool_failure_storm", true, 5),
    ];
    const hints = rankAndFormat(results, "7d");
    expect(hints).toHaveLength(1);
    expect(hints[0]!.category).toBe("tool_failure_storm");
  });

  it("sorts by impact descending", () => {
    const results = [
      makeResult("tool_failure_storm", true, 2),
      makeResult("edit_rejection_rate", true, 10),
      makeResult("cache_hit_ratio", true, 5),
    ];
    const hints = rankAndFormat(results, "7d");
    expect(hints[0]!.category).toBe("edit_rejection_rate");
    expect(hints[1]!.category).toBe("cache_hit_ratio");
    expect(hints[2]!.category).toBe("tool_failure_storm");
  });

  it("limits compatibility hints to top 6 results", () => {
    const patterns: QuickWinPattern[] = [
      "edit_rejection_rate",
      "tool_failure_storm",
      "cache_hit_ratio",
      "cost_per_loc_outlier",
      "long_turn_durations",
      "high_context_duration_tax",
    ];
    const results = patterns.map((pattern, i) => makeResult(pattern, true, i));
    const hints = rankAndFormat(results, "7d");
    expect(hints).toHaveLength(6);
  });

  it("sets drilldownAvailable based on evidence sessions", () => {
    const result = makeResult("high_context_duration_tax", true, 1);
    result.evidence.sessions = [];
    const hints = rankAndFormat([result], "7d");
    expect(hints[0]!.drilldownAvailable).toBe(false);
  });

  it("builds at least three diagnostics and includes high-evidence extras up to five", () => {
    const results = [
      makeResult("edit_rejection_rate", true, 10),
      makeResult("tool_failure_storm", true, 9),
      makeResult("cache_hit_ratio", true, 8),
      makeResult("cost_per_loc_outlier", true, 7),
      makeResult("long_turn_durations", true, 6),
      makeResult("high_context_duration_tax", true, 5),
    ];

    const diagnostics = buildDiagnostics(results);

    expect(rankQuickWins(results)).toHaveLength(6);
    expect(diagnostics).toHaveLength(5);
    expect(diagnostics[0]).toMatchObject({
      id: "edit_rejection_rate-diagnostic",
      rank: 1,
      sourcePattern: "edit_rejection_rate",
      evidenceChips: ["chip"],
    });
  });
});
