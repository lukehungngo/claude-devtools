import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TurnHistoryPanel } from "./TurnHistoryPanel";
import type { TurnSnapshot } from "../lib/turnSnapshot";

// jsdom doesn't implement scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTurn(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "Hello world",
    startIndex: 0,
    endIndex: 5,
    agents: [],
    status: "completed",
    durationMs: 3200,
    cost: 0.0042,
    costBreakdown: { total: 0.0042, tokensIn: 0.001, tokensOut: 0.0032 },
    startTime: new Date(Date.now() - 120_000).toISOString(),
    completedAt: new Date(Date.now() - 116_800).toISOString(),
    endTime: new Date(Date.now() - 116_800).toISOString(),
    ...overrides,
  };
}

describe("TurnHistoryPanel", () => {
  const defaultProps = {
    turns: [] as TurnSnapshot[],
    activeTurnIndex: null,
    onSelectTurn: vi.fn(),
    isOpen: true,
    onToggle: vi.fn(),
  };

  it("renders list of turns with correct turn numbers and truncated prompts", () => {
    const turns = [
      makeTurn({ turnNumber: 1, promptText: "Fix the bug in auth module" }),
      makeTurn({ turnNumber: 2, promptText: "Add tests for the new feature", startIndex: 5, endIndex: 10 }),
    ];
    render(<TurnHistoryPanel {...defaultProps} turns={turns} />);

    expect(screen.getByText("T1")).toBeTruthy();
    expect(screen.getByText("T2")).toBeTruthy();
    expect(screen.getByText("Fix the bug in auth module")).toBeTruthy();
    expect(screen.getByText("Add tests for the new feature")).toBeTruthy();
  });

  it("active turn has accent styling (border + background)", () => {
    const turns = [
      makeTurn({ turnNumber: 1 }),
      makeTurn({ turnNumber: 2, startIndex: 5, endIndex: 10 }),
    ];
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={turns} activeTurnIndex={1} />,
    );

    // Active item (index 1) should have accent border class
    const active = container.querySelector("[data-testid='turn-item-1']")!;
    expect(active.className).toContain("border-l-dt-accent");
    // Inactive item (index 0) should have transparent border
    const inactive = container.querySelector("[data-testid='turn-item-0']")!;
    expect(inactive.className).toContain("border-l-transparent");
  });

  it("empty state shows 'No turns yet' when turns=[]", () => {
    render(<TurnHistoryPanel {...defaultProps} turns={[]} />);
    expect(screen.getByText("No turns yet")).toBeTruthy();
  });

  it("collapse: isOpen=false renders with w-0", () => {
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} isOpen={false} />,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain("w-0");
    expect(panel.className).toContain("min-w-0");
  });

  it("agent dots only rendered when agents.length > 1", () => {
    const singleAgent = makeTurn({
      turnNumber: 1,
      agents: [
        {
          agentId: "main",
          agentType: "main",
          displayName: "Main",
          invocationCount: 3,
          status: "completed",
          cost: 0.004,
          tokensIn: 1000,
          tokensOut: 500,
          tools: ["Read"],
        },
      ],
    });
    const multiAgent = makeTurn({
      turnNumber: 2,
      startIndex: 5,
      endIndex: 10,
      agents: [
        {
          agentId: "main",
          agentType: "main",
          displayName: "M",
          invocationCount: 2,
          status: "completed",
          cost: 0.002,
          tokensIn: 500,
          tokensOut: 250,
          tools: [],
        },
        {
          agentId: "sub-1",
          agentType: "SWE",
          displayName: "SWE",
          invocationCount: 1,
          status: "completed",
          cost: 0.001,
          tokensIn: 300,
          tokensOut: 150,
          tools: ["Bash"],
        },
      ],
    });

    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={[singleAgent, multiAgent]} />,
    );

    // Single-agent turn should have no agent dots
    const item0 = container.querySelector("[data-testid='turn-item-0']")!;
    expect(item0.querySelector("[data-testid='agent-dots']")).toBeNull();

    // Multi-agent turn should have agent dots
    const item1 = container.querySelector("[data-testid='turn-item-1']")!;
    const dots = item1.querySelector("[data-testid='agent-dots']")!;
    expect(dots).not.toBeNull();
    expect(dots.children).toHaveLength(2);
  });

  it("click handler called with correct index", () => {
    const onSelectTurn = vi.fn();
    const turns = [
      makeTurn({ turnNumber: 1 }),
      makeTurn({ turnNumber: 2, startIndex: 5, endIndex: 10 }),
    ];
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={turns} onSelectTurn={onSelectTurn} />,
    );

    const item1 = container.querySelector("[data-testid='turn-item-1']")!;
    fireEvent.click(item1);
    expect(onSelectTurn).toHaveBeenCalledWith(1);
  });

  it("auto-scrolls active turn into view when activeTurnIndex changes", () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      makeTurn({ turnNumber: i + 1, startIndex: i * 5, endIndex: i * 5 + 4 }),
    );
    const { container, rerender } = render(
      <TurnHistoryPanel {...defaultProps} turns={turns} activeTurnIndex={0} />,
    );

    // Verify data-turn-panel-index attributes exist
    const item10 = container.querySelector("[data-turn-panel-index='10']");
    expect(item10).not.toBeNull();

    // Clear any initial-render scrollIntoView calls
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    // Change activeTurnIndex to 10 (simulating topbar stepper navigation)
    rerender(
      <TurnHistoryPanel {...defaultProps} turns={turns} activeTurnIndex={10} />,
    );

    // scrollIntoView should have been called on the item at index 10
    expect(item10!.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  // ─── Bug reproduction tests ─────────────────────────────────────

  it("P1-1: header has no inline style attribute (uses Tailwind classes)", () => {
    const { container } = render(<TurnHistoryPanel {...defaultProps} />);
    // Find the header by its aria-label button child
    const toggleBtn = container.querySelector("[aria-label='Toggle turn history']")!;
    const header = toggleBtn.parentElement!;
    expect(header.getAttribute("style")).toBeNull();
    expect(header.className).toContain("h-[30px]");
    expect(header.className).toContain("bg-dt-bg0");
    expect(header.className).toContain("border-b");
    expect(header.className).toContain("border-dt-border");
  });

  it("P2-tokens: active turn uses dt-accent token classes, not raw CSS vars", () => {
    const turns = [makeTurn({ turnNumber: 1 })];
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={turns} activeTurnIndex={0} />,
    );
    const item = container.querySelector("[data-testid='turn-item-0']")!;
    // Should use token class, not raw var
    expect(item.className).toContain("border-l-dt-accent");
    expect(item.className).not.toContain("border-l-[var(--acc)]");

    // Turn number text should use token
    const turnNum = item.querySelector(".font-mono.font-semibold")!;
    expect(turnNum.className).toContain("text-dt-accent");
    expect(turnNum.className).not.toContain("text-[var(--acc)]");
  });

  it("P2-tokens: inactive turn hover uses dt-bg1 token", () => {
    const turns = [makeTurn({ turnNumber: 1 })];
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={turns} activeTurnIndex={null} />,
    );
    const item = container.querySelector("[data-testid='turn-item-0']")!;
    expect(item.className).toContain("hover:bg-dt-bg1");
    expect(item.className).not.toContain("hover:bg-[var(--bg-s)]");
  });

  it("P2-isLive: component does not accept isLive prop", () => {
    // TypeScript enforces this at compile time via tsc --noEmit.
    // Runtime: just verify component renders fine without isLive.
    const { container } = render(<TurnHistoryPanel {...defaultProps} />);
    expect(container.querySelector(".text-dt-text2")).not.toBeNull();
  });

  it("running turn shows pulsing dot", () => {
    const runningTurn = makeTurn({
      turnNumber: 1,
      status: "running",
      durationMs: null,
    });
    const { container } = render(
      <TurnHistoryPanel {...defaultProps} turns={[runningTurn]} />,
    );

    const dot = container.querySelector("[data-testid='running-dot']");
    expect(dot).not.toBeNull();
  });
});
