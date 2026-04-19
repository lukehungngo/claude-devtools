import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { InsightsHourlyBucket } from "../../lib/types.js";
import { HourlyBars, findPeakBlock, fmtObsHour } from "./HourlyBars.js";

afterEach(cleanup);

function makeHourly(overrides: Partial<Record<number, number>> = {}): InsightsHourlyBucket[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tokensAvg: overrides[h] ?? 0,
  }));
}

describe("findPeakBlock", () => {
  it("returns null for all-zero data", () => {
    expect(findPeakBlock(makeHourly())).toBeNull();
  });

  it("finds 4-hour window with highest total", () => {
    const block = findPeakBlock(makeHourly({ 9: 100, 10: 200, 11: 150, 12: 120 }));
    expect(block).not.toBeNull();
    expect(block!.start).toBe(9);
  });

  it("returns percentage of total", () => {
    const block = findPeakBlock(makeHourly({ 9: 100, 10: 200, 11: 150, 12: 120 }));
    // peak sum = 570, total = 570, pct ≈ 100
    expect(block!.pct).toBeGreaterThan(0);
    expect(block!.pct).toBeLessThanOrEqual(100);
  });
});

describe("fmtObsHour", () => {
  it("formats midnight as 12 AM", () => {
    expect(fmtObsHour(0)).toBe("12 AM");
  });
  it("formats noon as 12 PM", () => {
    expect(fmtObsHour(12)).toBe("12 PM");
  });
  it("formats 9pm correctly", () => {
    expect(fmtObsHour(21)).toBe("9 PM");
  });
  it("formats 6am correctly", () => {
    expect(fmtObsHour(6)).toBe("6 AM");
  });
});

describe("HourlyBars component", () => {
  it("renders SVG element", () => {
    const { container } = render(<HourlyBars hourly={makeHourly({ 9: 5000 })} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders 24 bar rects", () => {
    const { container } = render(<HourlyBars hourly={makeHourly({ 9: 5000 })} />);
    const rects = container.querySelectorAll("rect[data-testid='hb-bar']");
    expect(rects).toHaveLength(24);
  });

  it("peak bar uses accent color fill", () => {
    const { container } = render(
      <HourlyBars hourly={makeHourly({ 9: 5000, 10: 6000, 11: 4000, 12: 3000 })} />
    );
    const rects = Array.from(container.querySelectorAll("rect[data-testid='hb-bar']"));
    const peakRect = rects[10]; // peak is around hour 10
    expect(peakRect.getAttribute("fill")).toContain("accent");
  });

  it("renders observation text element", () => {
    render(<HourlyBars hourly={makeHourly({ 9: 5000 })} />);
    expect(screen.getByTestId("hourly-observation")).not.toBeNull();
  });

  it("observation shows no-activity message when all zeros", () => {
    render(<HourlyBars hourly={makeHourly()} />);
    expect(screen.getByTestId("hourly-observation").textContent).toMatch(/no activity/i);
  });

  it("observation text matches design format", () => {
    render(
      <HourlyBars hourly={makeHourly({ 9: 100, 10: 200, 11: 150, 12: 120 })} />
    );
    const obs = screen.getByTestId("hourly-observation").textContent ?? "";
    expect(obs).toMatch(/token work/i);
    expect(obs).toMatch(/AM|PM/);
  });
});
