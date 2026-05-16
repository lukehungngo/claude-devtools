import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { ContextWarningBanner } from "./ContextWarningBanner";
import { LayoutContext } from "../../contexts/LayoutContext";
import type { LayoutContextValue } from "../../contexts/LayoutContext";

afterEach(() => {
  cleanup();
});

function makeLayoutCtx(overrides?: Partial<LayoutContextValue>): LayoutContextValue {
  return {
    repos: [], reposLoading: false, refreshRepos: () => {},
    permissions: [], decidePermission: async () => {}, decidePermissionSession: async () => {},
    usage: null, costs: null, isLive: false, registerSessionHandlers: () => {},
    currentMetrics: null, setCurrentMetrics: () => {},
    toolFilter: null, setToolFilter: () => {},
    questions: [], submitAnswer: async () => {},
    activeSessionId: null, setActiveSessionId: () => {},
    selected: null, setSelected: () => {},
    slugMap: new Map(), reverseSlugMap: new Map(),
    currentEvents: [], setCurrentEvents: () => {},
    currentLiveEvents: [], setCurrentLiveEvents: () => {},
    currentTurns: [], setCurrentTurns: () => {},
    currentDag: null, setCurrentDag: () => {},
    currentActiveTurnIndex: null, setCurrentActiveTurnIndex: () => {},
    currentSelectedAgent: null, setCurrentSelectedAgent: () => {},
    hasSubagents: false, setHasSubagents: () => {},
    currentSubagentMeta: null, setCurrentSubagentMeta: () => {},
    permissionMode: "default", setPermissionMode: () => {},
    turnHistoryOpen: true, setTurnHistoryOpen: () => {},
    viewingTurnNumber: undefined, setViewingTurnNumber: () => {},
    onClearViewingTurnRef: { current: null },
    onTurnClickRef: { current: null },
    openBottomTabRef: { current: null },
    highlightedToolUseId: null, setHighlightedToolUseId: () => {},
    highlightedHookId: null, setHighlightedHookId: () => {},
    lastResultStopReason: null, setLastResultStopReason: () => {},
    lastResultFinishReasons: null, setLastResultFinishReasons: () => {},
    autoCompactThreshold: null, setAutoCompactThreshold: () => {},
    liveHooks: null, setLiveHooks: () => {},
    ...overrides,
  };
}

describe("ContextWarningBanner", () => {
  it("does not render when contextPercent is below 90", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={85} />
    );
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();
  });

  it("shows warning banner at 90% context", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={90} />
    );
    const banner = container.querySelector("[data-testid='context-warning']");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("90%");
    expect(banner!.textContent).toContain("/compact");
    expect(banner!.className).toContain("bg-dt-yellow-dim");
    expect(banner!.className).toContain("text-dt-yellow");
  });

  it("shows critical warning at 95% context", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={95} />
    );
    const banner = container.querySelector("[data-testid='context-warning']");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("95%");
    expect(banner!.textContent).toContain("Compacting recommended");
    expect(banner!.className).toContain("bg-dt-red-dim");
    expect(banner!.className).toContain("text-dt-red");
  });

  it("renders a Compact Now button when onCompactNow is provided", () => {
    const onCompactNow = vi.fn();
    const { container } = render(
      <ContextWarningBanner contextPercent={92} onCompactNow={onCompactNow} />
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    const btn = within(banner as HTMLElement).getByRole("button", { name: /compact now/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onCompactNow).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed and reappears when context increases", () => {
    const { rerender, container } = render(
      <ContextWarningBanner contextPercent={91} />
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    const dismissBtn = within(banner as HTMLElement).getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();

    // Same percent -- stays dismissed
    rerender(<ContextWarningBanner contextPercent={91} />);
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();

    // Context increased -- reappears
    rerender(<ContextWarningBanner contextPercent={93} />);
    expect(container.querySelector("[data-testid='context-warning']")).not.toBeNull();
  });

  it("does not render when contextPercent is undefined", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={undefined} />
    );
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();
  });

  it("includes the real autocompact threshold when LayoutContext provides one", () => {
    const ctx = makeLayoutCtx({ autoCompactThreshold: 0.92 });
    const { container } = render(
      <LayoutContext.Provider value={ctx}>
        <ContextWarningBanner contextPercent={91} />
      </LayoutContext.Provider>
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    expect(banner.textContent).toContain("91%");
    // Threshold rendered as integer percent ("92%"), not "0.92".
    expect(banner.textContent).toContain("92%");
    expect(banner.textContent).toMatch(/autocompact|auto-compact/i);
  });

  it("falls back to /compact copy when no threshold is provided", () => {
    const ctx = makeLayoutCtx({ autoCompactThreshold: null });
    const { container } = render(
      <LayoutContext.Provider value={ctx}>
        <ContextWarningBanner contextPercent={91} />
      </LayoutContext.Provider>
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    expect(banner.textContent).toContain("/compact");
    expect(banner.textContent).not.toMatch(/autocompact fires/i);
  });
});
