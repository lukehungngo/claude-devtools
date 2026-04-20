import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { InsightsHourlyBucket } from "../../lib/types.js";
import { HourlyBars } from "./HourlyBars";

afterEach(cleanup);

function makeHourly(
  overrides: Partial<Record<number, number>> = {}
): InsightsHourlyBucket[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tokensAvg: overrides[h] ?? 0,
  }));
}

describe("HourlyBars component", () => {
  it("renders 24 SVG rect bars", () => {
    const { container } = render(<HourlyBars hourly={makeHourly({ 9: 5000 })} />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(24);
  });

  it("renders observation text in DOM", () => {
    render(<HourlyBars hourly={makeHourly({ 9: 5000, 10: 6000, 11: 4000 })} />);
    expect(screen.getByTestId("hourly-observation")).not.toBeNull();
  });

  it("observation shows peak block time range", () => {
    render(
      <HourlyBars hourly={makeHourly({ 9: 100, 10: 200, 11: 150, 12: 120 })} />
    );
    const obs = screen.getByTestId("hourly-observation");
    expect(obs.textContent).toMatch(/09:00|10:00/);
  });

  it("shows no-activity message when all zeros", () => {
    render(<HourlyBars hourly={makeHourly()} />);
    const obs = screen.getByTestId("hourly-observation");
    expect(obs.textContent).toMatch(/no activity/i);
  });

  it("renders without crash when all zeros", () => {
    const { container } = render(<HourlyBars hourly={makeHourly()} />);
    expect(container.firstElementChild).not.toBeNull();
  });

  it("shows tooltip with hour range on bar hover", () => {
    const { container } = render(
      <HourlyBars hourly={makeHourly({ 14: 9000 })} />
    );
    const rects = container.querySelectorAll("rect");
    fireEvent.mouseEnter(rects[14]);
    expect(container.textContent).toContain("14:00");
    expect(container.textContent).toContain("15:00");
  });

  it("shows avg tokens in tooltip", () => {
    const { container } = render(
      <HourlyBars hourly={makeHourly({ 10: 5000 })} />
    );
    const rects = container.querySelectorAll("rect");
    fireEvent.mouseEnter(rects[10]);
    expect(container.textContent).toContain("5.0K");
  });

  it("hides tooltip on bar mouse leave", () => {
    const { container } = render(
      <HourlyBars hourly={makeHourly({ 10: 5000 })} />
    );
    const rects = container.querySelectorAll("rect");
    fireEvent.mouseEnter(rects[10]);
    fireEvent.mouseLeave(rects[10]);
    const tooltipDivs = container.querySelectorAll("[style*='zIndex: 20']");
    expect(tooltipDivs.length).toBe(0);
  });
});
