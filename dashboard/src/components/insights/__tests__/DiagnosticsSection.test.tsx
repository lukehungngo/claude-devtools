import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DiagnosticsSection } from "../DiagnosticsSection";
import type { DiagnosticResult, QuickWinResult } from "../../../lib/insightsDiagnosticsTypes";

const diagnostics: DiagnosticResult[] = [
  {
    id: "tool_failure_storm-diagnostic",
    rank: 1,
    sourcePattern: "tool_failure_storm",
    category: "quality",
    severity: "high",
    confidence: "high",
    title: "Tool failures are slowing delivery",
    summary: "8 of 40 tool calls failed",
    impactLabel: "Quality risk",
    impactValue: "8 failed calls",
    impactDetail: "this period",
    changeThisWeek: "Fix the repeated failing command before retrying.",
    evidenceChips: ["20% failure rate", "8 failed calls"],
    evidenceSessionIds: ["s1"],
    whyFlagged: ["failedToolCalls: 8"],
    tellMeMore: {
      whatHappened: "Commands failed repeatedly.",
      whyItMatters: "Repeated failures cost time.",
      recommendedChanges: [
        {
          priority: 1,
          change: "Validate paths before running commands.",
          expectedEffect: "fewer failed calls",
        },
      ],
    },
  },
  {
    id: "cache_hit_ratio-diagnostic",
    rank: 2,
    sourcePattern: "cache_hit_ratio",
    category: "cost",
    severity: "medium",
    confidence: "medium",
    title: "Cache reuse is low",
    summary: "Cache hit ratio stayed below target",
    impactLabel: "Cost risk",
    impactValue: "$4.20",
    impactDetail: "estimated savings",
    changeThisWeek: "Keep related work in one session.",
    evidenceChips: ["52% cache hit ratio"],
    evidenceSessionIds: ["s2"],
    whyFlagged: ["cacheHitRatio: 0.52"],
    tellMeMore: {
      whatHappened: "Large prompts missed cache reuse.",
      whyItMatters: "Low cache reuse raises input cost.",
      recommendedChanges: [
        {
          priority: 1,
          change: "Avoid restarting related sessions.",
          expectedEffect: "higher cache reuse",
        },
      ],
    },
  },
];

const quickWins: QuickWinResult[] = [
  {
    id: "tool_failure_storm-7d",
    pattern: "tool_failure_storm",
    status: "warn",
    category: "quality",
    severity: "high",
    confidence: "high",
    title: "Tool failure storm",
    punchline: "8 of 40 tool calls failed",
    impactLabel: "Quality risk",
    impactValue: "8 failed calls",
    recommendation: "Validate paths before running commands.",
    rule: "failRate > 0.10",
    icon: "wrench",
    evidence: {
      sessions: [{ id: "s1", detail: "Bash failed repeatedly", cost: 1.2 }],
      recommendation: "Validate paths before running commands.",
      stats: { failedToolCalls: 8, totalToolCalls: 40 },
      chips: ["20% failure rate"],
    },
  },
];

afterEach(cleanup);

describe("DiagnosticsSection", () => {
  it("renders the coach-first diagnostics section with primary card and quick wins", () => {
    render(
      <DiagnosticsSection
        diagnostics={diagnostics}
        quickWins={quickWins}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText("This week's coaching")).toBeTruthy();
    expect(screen.getByText("2 patterns ranked by impact")).toBeTruthy();
    expect(screen.getByTestId("diagnostic-card-primary")).toBeTruthy();
    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(screen.getByText("Quick wins")).toBeTruthy();
  });

  it("updates expanded details when a secondary diagnostic is chosen", () => {
    render(
      <DiagnosticsSection
        diagnostics={diagnostics}
        quickWins={quickWins}
        loading={false}
        error={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Cache reuse is low/i }));

    expect(screen.getByRole("button", { name: /Cache reuse is low/i }).textContent).toContain(
      "Large prompts missed cache reuse."
    );
  });

  it("uses a single-open accordion for coaching pattern details", () => {
    render(
      <DiagnosticsSection
        diagnostics={diagnostics}
        quickWins={quickWins}
        loading={false}
        error={null}
      />
    );

    const firstPattern = screen.getByRole("button", {
      name: /Tool failures are slowing delivery/i,
    });
    const secondPattern = screen.getByRole("button", { name: /Cache reuse is low/i });

    expect(firstPattern.getAttribute("aria-expanded")).toBe("true");
    expect(firstPattern.textContent).toContain("Commands failed repeatedly.");
    expect(secondPattern.getAttribute("aria-expanded")).toBe("false");
    expect(secondPattern.textContent).not.toContain("Large prompts missed cache reuse.");

    fireEvent.click(secondPattern);

    expect(firstPattern.getAttribute("aria-expanded")).toBe("false");
    expect(firstPattern.textContent).not.toContain("Commands failed repeatedly.");
    expect(secondPattern.getAttribute("aria-expanded")).toBe("true");
    expect(secondPattern.textContent).toContain("Large prompts missed cache reuse.");
    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
  });

  it("shows and hides evidence as a third level under the expanded diagnosis", () => {
    render(
      <DiagnosticsSection
        diagnostics={diagnostics}
        quickWins={quickWins}
        loading={false}
        error={null}
      />
    );

    const firstPattern = screen.getByRole("button", {
      name: /Tool failures are slowing delivery/i,
    });

    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(firstPattern.textContent).toContain("Show evidence");

    fireEvent.click(firstPattern);

    const evidenceAnchor = screen.getByTestId("diagnostic-evidence-anchor");
    expect(firstPattern.nextElementSibling).toBe(evidenceAnchor);
    expect(screen.getByTestId("diagnostic-analysis").textContent).toContain(
      "Evidence"
    );
    expect(firstPattern.textContent).toContain("Hide evidence");

    fireEvent.click(firstPattern);

    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(firstPattern.textContent).toContain("Show evidence");
  });

  it("closes evidence when a different diagnosis is expanded", () => {
    render(
      <DiagnosticsSection
        diagnostics={diagnostics}
        quickWins={quickWins}
        loading={false}
        error={null}
      />
    );

    const firstPattern = screen.getByRole("button", {
      name: /Tool failures are slowing delivery/i,
    });
    fireEvent.click(firstPattern);
    expect(screen.getByTestId("diagnostic-analysis")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cache reuse is low/i }));

    const secondPattern = screen.getByRole("button", { name: /Cache reuse is low/i });
    expect(secondPattern.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(secondPattern.textContent).toContain("Show evidence");
  });

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(
      <DiagnosticsSection diagnostics={[]} quickWins={[]} loading error={null} />
    );
    expect(screen.getByTestId("diagnostics-loading")).toBeTruthy();

    rerender(
      <DiagnosticsSection
        diagnostics={[]}
        quickWins={[]}
        loading={false}
        error="HTTP 500"
      />
    );
    expect(screen.getByTestId("diagnostics-error")).toBeTruthy();

    rerender(
      <DiagnosticsSection diagnostics={[]} quickWins={[]} loading={false} error={null} />
    );
    expect(screen.getByTestId("diagnostics-empty")).toBeTruthy();
  });
});
