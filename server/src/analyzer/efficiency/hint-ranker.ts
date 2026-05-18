import type { DiagnosticResult, Hint, QuickWinResult } from "./types.js";

export function rankQuickWins(results: QuickWinResult[]): QuickWinResult[] {
  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6);
}

export function buildDiagnostics(results: QuickWinResult[]): DiagnosticResult[] {
  const ranked = rankQuickWins(results);
  const selected = [
    ...ranked.slice(0, 3),
    ...ranked.slice(3, 5).filter((r) => r.confidence === "high"),
  ];

  return selected
    .map((r, index) => ({
      id: `${r.pattern}-diagnostic`,
      rank: index + 1,
      sourcePattern: r.pattern,
      category: r.category,
      severity: r.severity,
      confidence: r.confidence,
      title: r.title,
      summary: r.punchline,
      impactLabel: r.impactLabel,
      impactValue: r.impactValue,
      impactDetail: r.status === "praise" ? "working well" : "this period",
      changeThisWeek: r.recommendation,
      evidenceChips: r.evidence.chips,
      evidenceSessionIds: r.evidence.sessions.map((s) => s.id),
      whyFlagged: formatWhyFlagged(r),
      tellMeMore: {
        whatHappened: r.punchline,
        whyItMatters: r.status === "praise"
          ? "This behavior is working. Keep it stable while improving weaker areas."
          : "This pattern is recurring enough to affect cost, latency, or quality.",
        recommendedChanges: [
          { priority: 1, change: r.recommendation, expectedEffect: r.impactValue },
        ],
      },
    }));
}

function formatWhyFlagged(result: QuickWinResult): string[] {
  const stats = result.evidence.stats;
  switch (result.pattern) {
    case "long_turn_durations":
      return [
        `${stats.longTurnCount} turns took over 1 minute`,
        `${stats.measuredTurns} measured turns in this range`,
      ];
    case "high_context_duration_tax":
      return [
        `${stats.highContextTurns} large-context turns`,
        `${stats.highContextDurationRatio}x slower than lighter turns`,
      ];
    case "cache_hit_ratio":
      return [
        `${stats.cacheHitRatio} cache reuse`,
        `${stats.inputTokens} input-side tokens reviewed`,
      ];
    case "edit_rejection_rate":
      return [
        `${stats.rejectedDecisions} rejected edit proposals`,
        `${stats.rejectRate} rejection rate`,
      ];
    case "tool_failure_storm":
      return [
        `${stats.failedToolCalls} failed tool calls`,
        `${stats.failRate} failure rate`,
      ];
    case "cost_per_loc_outlier":
      return [
        `${stats.locChanged} estimated lines changed`,
        `$${stats.costPerLocUsd} per estimated line`,
      ];
  }
}

export function rankAndFormat(results: QuickWinResult[], range: string): Hint[] {
  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6)
    .map((r) => ({
      id: `${r.pattern}-${range}`,
      category: r.pattern,
      icon: r.icon,
      punchline: r.punchline,
      impact: r.impact,
      trend: "new" as const,
      drilldownAvailable: r.evidence.sessions.length > 0,
    }));
}
