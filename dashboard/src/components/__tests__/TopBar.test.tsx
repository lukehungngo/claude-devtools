import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { TopBar } from "../TopBar";
import type { SessionMetrics } from "../../lib/types";

function renderTopBar(props: { metrics?: SessionMetrics | null; isLive?: boolean } = {}) {
  return render(
    <ThemeProvider>
      <TopBar metrics={props.metrics ?? null} isLive={props.isLive} />
    </ThemeProvider>
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

  it("renders ThemePicker button", () => {
    renderTopBar();
    expect(screen.getByRole("button", { name: "Change theme" })).toBeDefined();
  });

  it("renders ThemePicker alongside metrics", () => {
    renderTopBar({ metrics: STUB_METRICS });
    // Metrics content should be present
    expect(screen.getByText("Cost")).toBeDefined();
    // ThemePicker should also be present
    expect(screen.getByRole("button", { name: "Change theme" })).toBeDefined();
  });

  it("renders live status indicator", () => {
    renderTopBar({ isLive: true });
    expect(screen.getByText("LIVE")).toBeDefined();
  });

  it("renders done status when not live", () => {
    renderTopBar({ isLive: false });
    expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
  });
});
