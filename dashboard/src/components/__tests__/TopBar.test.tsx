import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TopBar } from "../TopBar";
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
});
