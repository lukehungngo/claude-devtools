import { describe, it, expect } from "vitest";
import { rankAndFormat } from "../hint-ranker.js";
import type { PatternResult } from "../types.js";

function makeResult(category: string, detected: boolean, impact: number): PatternResult {
  return {
    category: category as PatternResult["category"],
    detected,
    impact,
    icon: "test",
    punchline: `${category} punchline`,
    evidence: { sessions: [{ id: "s1", detail: "test", cost: 0 }], recommendation: "fix it", stats: {} },
  };
}

describe("rankAndFormat", () => {
  it("filters out non-detected results", () => {
    const results = [
      makeResult("wasted_retries", false, 10),
      makeResult("blind_edits", true, 5),
    ];
    const hints = rankAndFormat(results, "7d");
    expect(hints).toHaveLength(1);
    expect(hints[0]!.category).toBe("blind_edits");
  });

  it("sorts by impact descending", () => {
    const results = [
      makeResult("blind_edits", true, 2),
      makeResult("wasted_retries", true, 10),
      makeResult("cost_waste", true, 5),
    ];
    const hints = rankAndFormat(results, "7d");
    expect(hints[0]!.category).toBe("wasted_retries");
    expect(hints[1]!.category).toBe("cost_waste");
    expect(hints[2]!.category).toBe("blind_edits");
  });

  it("limits to top 5 results", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      makeResult("wasted_retries", true, i)
    );
    const hints = rankAndFormat(results, "7d");
    expect(hints).toHaveLength(5);
  });

  it("sets drilldownAvailable based on evidence sessions", () => {
    const result: PatternResult = {
      category: "improving_trend",
      detected: true,
      impact: 1,
      icon: "test",
      punchline: "test",
      evidence: { sessions: [], recommendation: "good", stats: {} },
    };
    const hints = rankAndFormat([result], "7d");
    expect(hints[0]!.drilldownAvailable).toBe(false);
  });
});
