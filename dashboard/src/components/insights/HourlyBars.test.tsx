import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { InsightsHourlyBucket } from "../../lib/types.js";

vi.mock("./EChartsWrapper.js", () => ({
  EChartsWrapper: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="echarts-wrapper" className={className ?? ""} />
  )),
}));

import { HourlyBars, buildHourlyBarsOption } from "./HourlyBars";

afterEach(cleanup);

function makeHourly(
  overrides: Partial<Record<number, number>> = {}
): InsightsHourlyBucket[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tokensAvg: overrides[h] ?? 0,
  }));
}

describe("buildHourlyBarsOption", () => {
  it("returns option with bar series type", () => {
    const option = buildHourlyBarsOption(makeHourly());
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe("bar");
  });

  it("series data has 24 entries", () => {
    const option = buildHourlyBarsOption(makeHourly());
    const series = option.series as Array<{ data: unknown[] }>;
    expect(series[0].data).toHaveLength(24);
  });

  it("peak hour bar uses accent color", () => {
    const option = buildHourlyBarsOption(makeHourly({ 14: 9000 }));
    const series = option.series as Array<{
      data: Array<{ value: number; itemStyle: { color: string } }>;
    }>;
    const peakBar = series[0].data[14];
    expect(peakBar.itemStyle.color).toMatch(/accent|#C|#D|#E/i);
  });

  it("non-peak bars use teal color", () => {
    const option = buildHourlyBarsOption(makeHourly({ 14: 9000 }));
    const series = option.series as Array<{
      data: Array<{ value: number; itemStyle: { color: string } }>;
    }>;
    const nonPeakBar = series[0].data[0];
    expect(nonPeakBar.itemStyle.color).not.toBe(series[0].data[14].itemStyle.color);
  });
});

describe("HourlyBars component", () => {
  it("renders EChartsWrapper with hourly data", () => {
    render(<HourlyBars hourly={makeHourly({ 9: 5000 })} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
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

  it("renders without crash", () => {
    render(<HourlyBars hourly={makeHourly()} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
  });
});
