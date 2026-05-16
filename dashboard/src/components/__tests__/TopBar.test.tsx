import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TopBar, __test__ as topBarTestExports } from "../TopBar";
import type { SessionMetrics } from "../../lib/types";

function renderTopBar(props: {
  metrics?: SessionMetrics | null;
  isLive?: boolean;
  hasPermissionPending?: boolean;
  viewingTurnNumber?: number;
  onClearViewingTurn?: () => void;
} = {}) {
  return render(
    <TopBar
      metrics={props.metrics ?? null}
      isLive={props.isLive}
      hasPermissionPending={props.hasPermissionPending}
      viewingTurnNumber={props.viewingTurnNumber}
      onClearViewingTurn={props.onClearViewingTurn}
    />
  );
}

const STUB_METRICS = {
  tokens: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0.05 },
  duration: 120000,
  totalAgents: 2,
  models: ["claude-sonnet-4-20250514"],
  contextPercent: 30,
  permissionMode: "default",
} as unknown as SessionMetrics;

describe("TopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders metrics when provided", () => {
    renderTopBar({ metrics: STUB_METRICS });
    expect(screen.getByText("Cost")).toBeDefined();
    expect(screen.getByText("Agents")).toBeDefined();
  });

  it("renders live status indicator", () => {
    renderTopBar({ isLive: true });
    expect(screen.getByText("LIVE")).toBeDefined();
  });

  it("renders done status when not live", () => {
    renderTopBar({ isLive: false });
    expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
  });

  describe("ViewingTurnPill", () => {
    it("renders pill with turn number when viewingTurnNumber is set", () => {
      renderTopBar({ metrics: STUB_METRICS, viewingTurnNumber: 170 });
      expect(screen.getByRole("status")).toBeDefined();
      expect(screen.getByText("T170")).toBeDefined();
    });

    it("does not render pill when viewingTurnNumber is undefined", () => {
      renderTopBar({ metrics: STUB_METRICS });
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("dismiss button has at least 32x32 touch target via padding", () => {
      renderTopBar({ metrics: STUB_METRICS, viewingTurnNumber: 42 });
      const dismissBtn = screen.getByLabelText("Stop viewing turn 42, return to latest");
      const style = dismissBtn.style;
      // The button should NOT have width/height of 16px with 0 padding
      // It should have padding that makes the total touch target at least 32x32
      const padding = parseInt(style.padding || "0", 10);
      const width = parseInt(style.width || "0", 10);
      const height = parseInt(style.height || "0", 10);
      // Effective size = dimension + 2*padding (padding on each side)
      const effectiveWidth = width + padding * 2;
      const effectiveHeight = height + padding * 2;
      expect(effectiveWidth).toBeGreaterThanOrEqual(32);
      expect(effectiveHeight).toBeGreaterThanOrEqual(32);
    });

    it("calls onClearViewingTurn when dismiss button is clicked", () => {
      const onClear = vi.fn();
      renderTopBar({ metrics: STUB_METRICS, viewingTurnNumber: 42, onClearViewingTurn: onClear });
      const dismissBtn = screen.getByLabelText("Stop viewing turn 42, return to latest");
      fireEvent.click(dismissBtn);
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe("WAITING state", () => {
    it("shows WAIT status with amber dot when permission pending and live", () => {
      renderTopBar({ isLive: true, hasPermissionPending: true });
      expect(screen.getByText("WAIT")).toBeDefined();
      // Should NOT show LIVE when waiting
      expect(screen.queryByText("LIVE")).toBeNull();
    });

    it("shows LIVE when live but no permission pending", () => {
      renderTopBar({ isLive: true, hasPermissionPending: false });
      expect(screen.getByText("LIVE")).toBeDefined();
      expect(screen.queryByText("WAIT")).toBeNull();
    });

    it("shows DONE when not live even if hasPermissionPending is true", () => {
      renderTopBar({ isLive: false, hasPermissionPending: true });
      expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
      expect(screen.queryByText("WAIT")).toBeNull();
    });

    it("applies amber color to dot and label when waiting", () => {
      const { container } = renderTopBar({ isLive: true, hasPermissionPending: true });
      const dot = container.querySelector("[data-testid='status-dot']");
      expect(dot).not.toBeNull();
      expect(dot!.getAttribute("style")).toContain("var(--amb)");
    });
  });

  describe("pseudo-model filtering", () => {
    it("does not display <synthetic> as the active model", () => {
      const metricsWithSynthetic = {
        ...STUB_METRICS,
        // Order matters: synthetic is last in the list — without the filter, TopBar
        // would pick it via modelsList[length - 1] and render `<synthetic>`.
        models: ["claude-opus-4-6", "<synthetic>"],
      } as unknown as SessionMetrics;

      renderTopBar({ metrics: metricsWithSynthetic, isLive: false });

      // The rendered model value must not be the raw pseudo-model string.
      expect(screen.queryByText("<synthetic>")).toBeNull();
      // It should fall back to the real model formatted short (Opus 4.6).
      expect(screen.getByText(/Opus/)).toBeDefined();
    });
  });

  describe("red border on context danger", () => {
    it("applies red outline when contextPercent >= 80", () => {
      const dangerMetrics = { ...STUB_METRICS, contextPercent: 85 } as unknown as SessionMetrics;
      const { container } = renderTopBar({ metrics: dangerMetrics });
      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv.style.outline).toBe("2px solid var(--red)");
    });

    it("applies red outline when contextPercent is exactly 80", () => {
      const borderMetrics = { ...STUB_METRICS, contextPercent: 80 } as unknown as SessionMetrics;
      const { container } = renderTopBar({ metrics: borderMetrics });
      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv.style.outline).toBe("2px solid var(--red)");
    });

    it("does not apply red outline when contextPercent < 80", () => {
      const safeMetrics = { ...STUB_METRICS, contextPercent: 79 } as unknown as SessionMetrics;
      const { container } = renderTopBar({ metrics: safeMetrics });
      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv.style.outline).not.toBe("2px solid var(--red)");
    });
  });

  describe("context window size suffix", () => {
    it("shows context percent", () => {
      const metricsWithPct = { ...STUB_METRICS, contextPercent: 67, contextWindowSize: 200000 } as unknown as SessionMetrics;
      renderTopBar({ metrics: metricsWithPct });
      expect(screen.getByText("67%")).toBeDefined();
    });

    it("shows 'of 200K' suffix for 200k context window", () => {
      const metricsWithSize = { ...STUB_METRICS, contextPercent: 67, contextWindowSize: 200000 } as unknown as SessionMetrics;
      renderTopBar({ metrics: metricsWithSize });
      expect(screen.getByText(/of 200K/)).toBeDefined();
    });

    it("shows 'of 1M' for 1M context window", () => {
      const metricsWithLargeWindow = { ...STUB_METRICS, contextPercent: 10, contextWindowSize: 1000000 } as unknown as SessionMetrics;
      renderTopBar({ metrics: metricsWithLargeWindow });
      expect(screen.getByText(/of 1M/)).toBeDefined();
    });

    it("does not show suffix when contextWindowSize is 0", () => {
      const metricsNoSize = { ...STUB_METRICS, contextPercent: 30, contextWindowSize: 0 } as unknown as SessionMetrics;
      renderTopBar({ metrics: metricsNoSize });
      expect(screen.queryByText(/of 0/)).toBeNull();
    });
  });

  describe("HUD read-only — model always shown", () => {
    it("renders Model HudMetric even when isLive=true", () => {
      // Invariant: TopBar is a read-only HUD. Model must always display as static text.
      // Bug (now fixed): when isLive=true the ControlsZone replaced HudMetric("Model"),
      // hiding the "Model" label entirely.
      renderTopBar({ metrics: STUB_METRICS, isLive: true });
      expect(screen.getByText("Model")).toBeDefined();
      expect(screen.getByText(/Sonnet/)).toBeDefined();
    });

    it("renders Context even when isLive=true", () => {
      // Bug (now fixed): !(isLive && onModelSelect) guard hid Context while live.
      const metricsWithPct = { ...STUB_METRICS, contextPercent: 45, contextWindowSize: 200000 } as unknown as SessionMetrics;
      renderTopBar({ metrics: metricsWithPct, isLive: true });
      expect(screen.getByText("Context")).toBeDefined();
      expect(screen.getByText("45%")).toBeDefined();
    });
  });

  describe("YOLO badge", () => {
    it("renders YOLO badge for bypassPermissions mode", () => {
      render(
        <TopBar
          metrics={null}
          permissionMode="bypassPermissions"
          onPermissionModeChange={() => {}}
        />
      );
      expect(screen.getByText("YOLO")).toBeDefined();
    });
  });

  describe("branch crumb Pencil icon", () => {
    it("renders a Pencil icon before the branch name when branch is provided", () => {
      const { container } = render(
        <TopBar
          metrics={null}
          repoName="my-repo"
          branch="main"
        />
      );
      const pencilIcon = container.querySelector('[data-testid="branch-edit-icon"]');
      expect(pencilIcon).not.toBeNull();
    });

    it("does not render Pencil icon when branch is not provided", () => {
      const { container } = render(
        <TopBar
          metrics={null}
          repoName="my-repo"
        />
      );
      const pencilIcon = container.querySelector('[data-testid="branch-edit-icon"]');
      expect(pencilIcon).toBeNull();
    });
  });

  describe("formatModelShort (P2-8)", () => {
    const formatModelShort = topBarTestExports.formatModelShort;

    it("formats known Anthropic families with version", () => {
      expect(formatModelShort("claude-opus-4-7")).toBe("Opus 4.7");
      expect(formatModelShort("claude-sonnet-4-6")).toBe("Sonnet 4.6");
      expect(formatModelShort("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    });

    it("appends (1M) when the [1m] context-window suffix is present", () => {
      expect(formatModelShort("claude-opus-4-6[1m]")).toBe("Opus 4.6 (1M)");
      expect(formatModelShort("claude-sonnet-4-6[1M]")).toBe("Sonnet 4.6 (1M)");
    });

    it("title-cases unknown family names rather than dropping them", () => {
      expect(formatModelShort("claude-sonnet-5-0-preview")).toBe("Sonnet 5.0");
      expect(formatModelShort("anthropic-future-1-0")).toBe("Future 1.0");
      expect(formatModelShort("claude-newfamily-2-3")).toBe("Newfamily 2.3");
    });

    it("returns the model id unchanged when no version is parseable", () => {
      expect(formatModelShort("custom-model")).toBe("custom-model");
      expect(formatModelShort("local")).toBe("local");
    });
  });
});
