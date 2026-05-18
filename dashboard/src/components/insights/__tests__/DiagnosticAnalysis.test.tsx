import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiagnosticAnalysis } from "../DiagnosticAnalysis";
import type { DiagnosticResult } from "../../../lib/insightsDiagnosticsTypes";

const diagnostic: DiagnosticResult = {
  id: "edit_rejection_rate-diagnostic",
  kind: "proven",
  rank: 1,
  sourcePattern: "edit_rejection_rate",
  category: "quality",
  severity: "medium",
  confidence: "high",
  title: "Edit proposals need tighter scope",
  summary: "3 of 12 proposed edits rejected",
  impactLabel: "Quality risk",
  impactValue: "25% rejected",
  impactDetail: "this period",
  changeThisWeek: "Read the target file and ask before broad writes.",
  evidenceChips: ["3 rejected edits"],
  evidenceSessionIds: ["s1", "s2"],
  whyFlagged: ["rejectRate: 0.25"],
  aiGeneratedFields: [],
  tellMeMore: {
    whatHappened: "Several write proposals were rejected.",
    whyItMatters: "Rejected edits add review friction.",
    recommendedChanges: [
      {
        priority: 1,
        change: "Read the target file immediately before editing.",
        expectedEffect: "fewer rejected proposals",
      },
      {
        priority: 2,
        change: "Confirm destructive changes first.",
        expectedEffect: "less rework",
      },
    ],
  },
};

afterEach(cleanup);

describe("DiagnosticAnalysis", () => {
  it("renders selected diagnostic explanation and recommended changes", () => {
    render(<DiagnosticAnalysis diagnostic={diagnostic} />);

    expect(screen.getByTestId("diagnostic-analysis")).toBeTruthy();
    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(screen.getByText("3 rejected edits")).toBeTruthy();
    expect(screen.getByText("s1")).toBeTruthy();
    expect(screen.getByText("rejectRate: 0.25")).toBeTruthy();
  });
});
