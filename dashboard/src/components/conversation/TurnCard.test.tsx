/**
 * Tests for TurnCard v4 avatar-based message layout.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TurnCard, extractFindings } from "./TurnCard";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";

function makeAssistantEvent(text: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: "asst-1",
    timestamp: "2026-01-01T00:00:01Z",
    sessionId: "sess-1",
    agentId: "main",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "end_turn",
    },
  } as AssistantEvent;
}

function makeTurnAndEvents(
  overrides: Partial<TurnSnapshot> = {},
  events: SessionEvent[] = [],
): { turn: TurnSnapshot; allEvents: SessionEvent[] } {
  return {
    turn: {
      turnNumber: 1,
      promptText: "Hello world",
      startTime: "2026-01-01T00:00:00Z",
      status: "done",
      cost: 0,
      agents: [],
      startIndex: 0,
      endIndex: events.length,
      durationMs: null,
      costBreakdown: { total: 0, tokensIn: 0, tokensOut: 0 },
      endTime: "",
      completedAt: "",
      ...overrides,
    } as TurnSnapshot,
    allEvents: events,
  };
}

describe("TurnCard — avatar-based message layout", () => {
  it("renders user avatar and prompt text", () => {
    const { turn, allEvents } = makeTurnAndEvents();
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const card = container.querySelector(".conv-turn") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("U");
    expect(card.textContent).toContain("You");
    expect(card.textContent).toContain("Hello world");
  });

  it("renders Claude avatar and response when events present", () => {
    const evts = [makeAssistantEvent("I can help with that.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("Claude");
    expect(container.textContent).toContain("I can help with that.");
  });

  it("fires onTurnClick when the card is clicked", () => {
    const onTurnClick = vi.fn();
    const { turn, allEvents } = makeTurnAndEvents();
    const { container } = render(
      <TurnCard turn={turn} allEvents={allEvents} onTurnClick={onTurnClick} />
    );

    const card = container.querySelector(".conv-turn") as HTMLElement;
    fireEvent.click(card);

    expect(onTurnClick).toHaveBeenCalledTimes(1);
  });
});

describe("TurnCard — completion indicator", () => {
  it("shows 'Generating...' for a running turn", () => {
    const evts = [makeAssistantEvent("Working on it...")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { status: "running", durationMs: null, endTime: "", completedAt: "" },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Generating...");
  });

  it("shows 'Completed in Xs' for a completed turn with durationMs", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      {
        status: "completed",
        durationMs: 45000,
        startTime: "2026-03-29T14:30:00Z",
        endTime: "2026-03-29T14:30:45Z",
        completedAt: "2026-03-29T14:30:45Z",
      },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed in");
    expect(indicator!.textContent).toContain("45.0s");
  });

  it("shows 'Completed' without duration when durationMs is null", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { status: "completed", durationMs: null },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Completed");
    expect(indicator!.textContent).not.toContain("Completed in");
  });
});

describe("TurnCard — VerdictBanner", () => {
  it("renders VerdictBanner when response contains 'Verdict: PROCEED'", () => {
    const evts = [
      makeAssistantEvent("All checks passed.\n\n**Verdict: PROCEED** — all tasks done"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banner = container.querySelector('[data-testid="verdict-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("PROCEED");
    expect(banner!.getAttribute("aria-label")).toContain("proceed");
  });

  it("renders VerdictBanner with blocked verdict for '**BLOCKED**'", () => {
    const evts = [
      makeAssistantEvent("Review complete.\n\n**BLOCKED** — critical issue found"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banner = container.querySelector('[data-testid="verdict-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("aria-label")).toContain("blocked");
  });

  it("renders VerdictBanner for 'Verdict: APPROVED'", () => {
    const evts = [
      makeAssistantEvent("Code looks good.\n\nVerdict: APPROVED"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banner = container.querySelector('[data-testid="verdict-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("aria-label")).toContain("approved");
  });

  it("does NOT render VerdictBanner for normal response text", () => {
    const evts = [
      makeAssistantEvent("I can help with that. Let me take a look."),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banner = container.querySelector('[data-testid="verdict-banner"]');
    expect(banner).toBeNull();
  });

  it("renders VerdictBanner BEFORE AgentPills", () => {
    const evts = [
      makeAssistantEvent("**Verdict: PROCEED** — done"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      {
        agents: [
          {
            agentId: "agent-1",
            agentType: "Task",
            displayName: "Task Agent",
            invocationCount: 1,
            status: "completed" as const,
            cost: 0.001,
            tokensIn: 100,
            tokensOut: 50,
            tools: ["read_file"],
          },
        ],
      },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banner = container.querySelector('[data-testid="verdict-banner"]');
    expect(banner).not.toBeNull();

    // VerdictBanner should appear before AgentPills in the DOM
    const claudeSection = banner!.parentElement!;
    const children = Array.from(claudeSection.children);
    const bannerIdx = children.indexOf(banner as Element);
    // AgentPills renders a container div — find it after the banner
    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    // The banner should be among the first few children (after "Claude" label)
    expect(bannerIdx).toBeLessThanOrEqual(2);
  });
});

describe("TurnCard — CostFooter wiring", () => {
  it("renders CostFooter when turn.cost > 0", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      {
        cost: 0.0035,
        costBreakdown: { total: 0.0035, tokensIn: 500, tokensOut: 200 },
        agents: [
          {
            agentId: "agent-1",
            agentType: "Task",
            displayName: "Task Agent",
            invocationCount: 1,
            status: "completed" as const,
            cost: 0.001,
            tokensIn: 100,
            tokensOut: 50,
            tools: ["read_file"],
          },
        ],
      },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const costFooter = container.querySelector('[aria-label="Cost breakdown"]');
    expect(costFooter).not.toBeNull();
    expect(costFooter!.textContent).toContain("Total:");
    expect(costFooter!.textContent).toContain("Agent:");
  });

  it("does NOT render CostFooter when turn.cost is 0", () => {
    const evts = [makeAssistantEvent("Done.")] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents(
      { cost: 0, agents: [] },
      evts,
    );
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const costFooter = container.querySelector('[aria-label="Cost breakdown"]');
    expect(costFooter).toBeNull();
  });
});

// ─── extractFindings unit tests ─────────────────────────────────────

describe("extractFindings", () => {
  function textItems(...texts: string[]): ContentItem[] {
    return texts.map((text) => ({ type: "text" as const, text }));
  }

  it("extracts Flag: pattern as flag severity", () => {
    const items = textItems("Flag: something exceeded spec");
    const findings = extractFindings(items);
    expect(findings).toEqual([
      { severity: "flag", text: "something exceeded spec" },
    ]);
  });

  it("extracts **Warning:** pattern as warning severity", () => {
    const items = textItems("**Warning:** missing coverage for edge case");
    const findings = extractFindings(items);
    expect(findings).toEqual([
      { severity: "warning", text: "missing coverage for edge case" },
    ]);
  });

  it("extracts P0: and P1: as error severity", () => {
    const items = textItems("P0: critical data loss bug\nP1: performance regression");
    const findings = extractFindings(items);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({ severity: "error", text: "critical data loss bug" });
    expect(findings[1]).toEqual({ severity: "error", text: "performance regression" });
  });

  it("returns empty array for normal text", () => {
    const items = textItems("Everything looks good. No issues found.");
    const findings = extractFindings(items);
    expect(findings).toEqual([]);
  });

  it("does not match patterns mid-line", () => {
    const items = textItems("The user said Flag: something but this is not a finding");
    const findings = extractFindings(items);
    expect(findings).toEqual([]);
  });

  it("handles multiple findings across content items", () => {
    const items = textItems(
      "Flag: first issue",
      "Warning: second issue\nP0: third issue",
    );
    const findings = extractFindings(items);
    expect(findings).toHaveLength(3);
    expect(findings[0].severity).toBe("flag");
    expect(findings[1].severity).toBe("warning");
    expect(findings[2].severity).toBe("error");
  });

  it("skips non-text content items", () => {
    const items: ContentItem[] = [
      { type: "thinking" as const, thinking: "internal thought" },
      { type: "text" as const, text: "Flag: real finding" },
    ];
    const findings = extractFindings(items);
    expect(findings).toEqual([{ severity: "flag", text: "real finding" }]);
  });
});

// ─── FindingBanner rendering in TurnCard ────────────────────────────

describe("TurnCard — FindingBanner wiring", () => {
  it("renders FindingBanner for Flag: in response", () => {
    const evts = [
      makeAssistantEvent("Flag: something exceeded spec"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banners = container.querySelectorAll('[role="status"]');
    expect(banners.length).toBeGreaterThanOrEqual(1);
    const flagBanner = Array.from(banners).find((b) =>
      b.textContent?.includes("FLAG"),
    );
    expect(flagBanner).not.toBeUndefined();
    expect(flagBanner!.textContent).toContain("something exceeded spec");
  });

  it("renders FindingBanner for Warning: in response", () => {
    const evts = [
      makeAssistantEvent("Warning: missing coverage"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const banners = container.querySelectorAll('[role="status"]');
    const warnBanner = Array.from(banners).find((b) =>
      b.textContent?.includes("WARNING"),
    );
    expect(warnBanner).not.toBeUndefined();
    expect(warnBanner!.textContent).toContain("missing coverage");
  });

  it("renders FindingBanner with alert role for P0:", () => {
    const evts = [
      makeAssistantEvent("P0: data loss detected"),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const errorBanner = Array.from(alerts).find((b) =>
      b.textContent?.includes("ERROR"),
    );
    expect(errorBanner).not.toBeUndefined();
    expect(errorBanner!.textContent).toContain("data loss detected");
  });

  it("does NOT render FindingBanner for normal response", () => {
    const evts = [
      makeAssistantEvent("I can help with that. Let me check."),
    ] as SessionEvent[];
    const { turn, allEvents } = makeTurnAndEvents({}, evts);
    const { container } = render(<TurnCard turn={turn} allEvents={allEvents} />);

    // No finding banners should exist — check both roles
    const statusBanners = container.querySelectorAll('[role="status"]');
    const alertBanners = container.querySelectorAll('[role="alert"]');
    // Filter to only FindingBanner-style ones (have FLAG/WARNING/ERROR labels)
    const findingBanners = [...Array.from(statusBanners), ...Array.from(alertBanners)].filter(
      (b) => b.textContent?.match(/^(FLAG|WARNING|ERROR)/),
    );
    expect(findingBanners).toHaveLength(0);
  });
});
