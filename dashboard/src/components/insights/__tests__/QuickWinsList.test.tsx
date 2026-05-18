import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuickWinsList } from "../QuickWinsList";
import type { QuickWinResult } from "../../../lib/insightsDiagnosticsTypes";

const quickWins: QuickWinResult[] = [
  {
    id: "cache_hit_ratio-7d",
    pattern: "cache_hit_ratio",
    status: "warn",
    category: "cost",
    severity: "medium",
    confidence: "medium",
    title: "Cache reuse is low",
    punchline: "estimated ~$4 potential cache savings",
    impactLabel: "Cost",
    impactValue: "$4.20",
    recommendation: "Keep related work in one session.",
    rule: "cacheHitRatio < 0.60",
    icon: "database",
    evidence: {
      sessions: [{ id: "s2", detail: "High input token session", cost: 4.2 }],
      recommendation: "Keep related work in one session.",
      stats: { cacheHitRatio: 0.52 },
      chips: ["52% cache hit ratio"],
    },
  },
  {
    id: "long_turn_durations-7d",
    pattern: "long_turn_durations",
    status: "praise",
    category: "latency",
    severity: "positive",
    confidence: "high",
    title: "Turns are staying fast",
    punchline: "Turns are staying under 20s",
    impactLabel: "Latency",
    impactValue: "18s",
    recommendation: "Keep requests focused.",
    rule: "p95DurationMs < 20000",
    icon: "timer",
    evidence: {
      sessions: [],
      recommendation: "Keep requests focused.",
      stats: { slowestTypicalTurnMs: 18_000 },
      chips: ["slow turns 18s"],
    },
  },
];

afterEach(cleanup);

describe("QuickWinsList", () => {
  it("renders quick wins with status, impact, and recommendations", () => {
    render(<QuickWinsList quickWins={quickWins} />);

    expect(screen.getByTestId("section-quick-wins")).toBeTruthy();
    expect(screen.getByText("Quick wins")).toBeTruthy();
    expect(screen.getByText("Small fixes you can apply immediately.")).toBeTruthy();
    expect(screen.getByText("Cache reuse is low")).toBeTruthy();
    expect(screen.getByText("$4.20")).toBeTruthy();
    expect(screen.getByText("COST")).toBeTruthy();
    expect(screen.getAllByText("Change:")).toHaveLength(2);
    expect(screen.getByText("Keep related work in one session.")).toBeTruthy();
    expect(screen.getByText("Working well")).toBeTruthy();
    expect(screen.getByText("LATENCY")).toBeTruthy();
  });

  it("renders an empty state when there are no quick wins", () => {
    render(<QuickWinsList quickWins={[]} />);

    expect(screen.getByText("No quick wins fired for this range.")).toBeTruthy();
  });
});
