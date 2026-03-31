import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TopBar } from "../TopBar";
import type { SessionMetrics } from "../../lib/types";

function renderTopBar(props: {
  metrics?: SessionMetrics | null;
  isLive?: boolean;
  viewingTurnNumber?: number;
  onClearViewingTurn?: () => void;
} = {}) {
  return render(
    <TopBar
      metrics={props.metrics ?? null}
      isLive={props.isLive}
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
});
