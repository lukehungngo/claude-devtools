import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HourlyBars } from "./HourlyBars.js";
import type { InsightsHourlyBucket } from "../../lib/types.js";

afterEach(cleanup);

function makeHourly(overrides: Partial<Record<number, number>> = {}): InsightsHourlyBucket[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tokensAvg: overrides[h] ?? 0,
  }));
}

describe("HourlyBars", () => {
  it("renders 24 bars", () => {
    const { container } = render(<HourlyBars hourly={makeHourly()} />);
    const bars = container.querySelectorAll("[data-testid^='hourly-bar-']");
    expect(bars).toHaveLength(24);
  });

  it("renders observation sentence", () => {
    render(<HourlyBars hourly={makeHourly({ 9: 5000, 10: 6000, 11: 4000 })} />);
    expect(screen.getByTestId("hourly-observation")).not.toBeNull();
  });

  it("shows peak hour bar with accent color", () => {
    const { container } = render(
      <HourlyBars hourly={makeHourly({ 14: 9000 })} />
    );
    const peakBar = container.querySelector("[data-testid='hourly-bar-14']");
    expect(peakBar?.getAttribute("fill")).toContain("accent");
  });

  it("shows empty state when all zeros", () => {
    render(<HourlyBars hourly={makeHourly()} />);
    const obs = screen.getByTestId("hourly-observation");
    expect(obs.textContent).toMatch(/no activity/i);
  });

  it("observation sentence names the peak 4-hour block", () => {
    render(<HourlyBars hourly={makeHourly({ 9: 100, 10: 200, 11: 150, 12: 120 })} />);
    const obs = screen.getByTestId("hourly-observation");
    expect(obs.textContent).toMatch(/09:00|10:00|11:00|12:00/);
  });
});
