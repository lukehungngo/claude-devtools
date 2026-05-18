import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DiagnosticsSection } from "../DiagnosticsSection";
import type { DiagnosticResult, QuickWinResult } from "../../../lib/insightsDiagnosticsTypes";

const diagnostics: DiagnosticResult[] = [
  {
    id: "tool_failure_storm-diagnostic",
    kind: "proven",
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
    aiGeneratedFields: [],
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
    kind: "proven",
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
    aiGeneratedFields: [],
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

    expect(screen.getByText("Build better with AI")).toBeTruthy();
    expect(
      screen.getByText("Based on your last 7 days, these are the 2 patterns that slowed you down most.")
    ).toBeTruthy();
    expect(screen.queryByText("Ranked by impact")).toBeNull();
    expect(screen.queryByText("plain-language coaching from deterministic signals")).toBeNull();
    expect(screen.getByTestId("diagnostic-card-primary")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Tool failures are slowing delivery/i }).getAttribute("aria-expanded")
    ).toBe("false");
    expect(screen.queryByText("Commands failed repeatedly.")).toBeNull();
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

    expect(screen.getByTestId("diagnostic-card-secondary").textContent).toContain(
      "Large prompts missed cache reuse."
    );
  });

  it("uses a single-open accordion for coaching pattern details and allows collapse", () => {
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

    expect(firstPattern.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Commands failed repeatedly.")).toBeNull();
    expect(secondPattern.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Large prompts missed cache reuse.")).toBeNull();

    fireEvent.click(firstPattern);

    expect(firstPattern.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("diagnostic-card-primary").textContent).toContain(
      "Commands failed repeatedly."
    );

    fireEvent.click(secondPattern);

    expect(firstPattern.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Commands failed repeatedly.")).toBeNull();
    expect(secondPattern.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("diagnostic-card-secondary").textContent).toContain(
      "Large prompts missed cache reuse."
    );
    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();

    fireEvent.click(secondPattern);

    expect(secondPattern.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Large prompts missed cache reuse.")).toBeNull();
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

    fireEvent.click(firstPattern);
    expect(screen.getByTestId("diagnostic-card-primary").textContent).toContain("Show evidence");
    expect(firstPattern.textContent).toContain("Hide details");

    fireEvent.click(screen.getByRole("button", { name: "Show evidence" }));

    const evidenceAnchor = screen.getByTestId("diagnostic-evidence-anchor");
    expect(screen.getByTestId("diagnostic-card-primary").contains(evidenceAnchor)).toBe(true);
    expect(screen.getByTestId("diagnostic-analysis").textContent).toContain(
      "Evidence"
    );
    expect(screen.getByRole("button", { name: "Hide evidence" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide evidence" }));

    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(screen.getByRole("button", { name: "Show evidence" })).toBeTruthy();

    fireEvent.click(firstPattern);

    expect(firstPattern.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Show evidence" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Show evidence" }));
    expect(screen.getByTestId("diagnostic-analysis")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cache reuse is low/i }));

    const secondPattern = screen.getByRole("button", { name: /Cache reuse is low/i });
    expect(secondPattern.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByTestId("diagnostic-analysis")).toBeNull();
    expect(screen.getByTestId("diagnostic-card-secondary").textContent).toContain("Show evidence");
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
