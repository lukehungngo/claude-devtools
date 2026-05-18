import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiagnosticCard } from "../DiagnosticCard";
import type { DiagnosticResult } from "../../../lib/insightsDiagnosticsTypes";

const diagnostic: DiagnosticResult = {
  id: "long_turn_durations-diagnostic",
  rank: 1,
  sourcePattern: "long_turn_durations",
  category: "latency",
  severity: "high",
  confidence: "high",
  title: "Long turns are delaying feedback",
  summary: "Slow turns reached 1m 13s",
  impactLabel: "Latency",
  impactValue: "1m 13s",
  impactDetail: "this period",
  changeThisWeek: "Split broad requests before they enter long tool loops.",
  evidenceChips: ["7 turns over 1m", "slow turns 1m 13s"],
  evidenceSessionIds: ["s1"],
  whyFlagged: ["7 turns took over 1 minute"],
  tellMeMore: {
    whatHappened: "Several turns exceeded one minute.",
    whyItMatters: "Slow feedback makes iteration harder.",
    recommendedChanges: [
      {
        priority: 1,
        change: "Ask for smaller changes per turn.",
        expectedEffect: "shorter feedback loops",
      },
    ],
  },
};

afterEach(cleanup);

describe("DiagnosticCard", () => {
  it("renders a primary diagnostic with impact, evidence strength, and chips", () => {
    render(<DiagnosticCard diagnostic={diagnostic} variant="primary" selected onSelect={() => {}} />);

    expect(screen.getByTestId("diagnostic-card-primary")).toBeTruthy();
    expect(screen.getByText("Long turns are delaying feedback")).toBeTruthy();
    expect(screen.getByText("1m 13s")).toBeTruthy();
    expect(screen.getByText("Strong evidence")).toBeTruthy();
    expect(screen.getByText("7 turns over 1m")).toBeTruthy();
  });

  it("renders a compact secondary diagnostic as a button", () => {
    render(
      <DiagnosticCard
        diagnostic={diagnostic}
        variant="secondary"
        selected={false}
        onSelect={() => {}}
      />
    );

    expect(screen.getByTestId("diagnostic-card-secondary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Long turns are delaying feedback/i })).toBeTruthy();
  });
});
