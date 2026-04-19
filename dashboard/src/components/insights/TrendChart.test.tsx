import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./EChartsWrapper.js", () => ({
  EChartsWrapper: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="echarts-wrapper" className={className ?? ""} />
  )),
}));

import { TrendChart, buildTrendChartOption } from "./TrendChart";

afterEach(cleanup);

const DAILY = [
  { date: "2026-04-10", tokensIn: 1000, tokensOut: 500 },
  { date: "2026-04-11", tokensIn: 2000, tokensOut: 1000 },
  { date: "2026-04-12", tokensIn: 1500, tokensOut: 750 },
];

describe("buildTrendChartOption", () => {
  it("returns option with 2 line series for non-empty daily", () => {
    const option = buildTrendChartOption(DAILY);
    const series = option.series as Array<{ type: string; data: number[] }>;
    expect(series).toHaveLength(2);
    expect(series[0].type).toBe("line");
    expect(series[1].type).toBe("line");
  });

  it("first series data matches tokensIn values", () => {
    const option = buildTrendChartOption(DAILY);
    const series = option.series as Array<{ data: number[] }>;
    expect(series[0].data).toEqual([1000, 2000, 1500]);
  });

  it("second series data matches tokensOut values", () => {
    const option = buildTrendChartOption(DAILY);
    const series = option.series as Array<{ data: number[] }>;
    expect(series[1].data).toEqual([500, 1000, 750]);
  });

  it("xAxis.data contains MM-DD date labels", () => {
    const option = buildTrendChartOption(DAILY);
    const xAxis = option.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["04-10", "04-11", "04-12"]);
  });

  it("both series are stacked (stack: 'total')", () => {
    const option = buildTrendChartOption(DAILY);
    const series = option.series as Array<{ stack?: string }>;
    expect(series[0].stack).toBe("total");
    expect(series[1].stack).toBe("total");
  });
});

describe("TrendChart component", () => {
  it("renders EChartsWrapper when daily has data", () => {
    render(<TrendChart daily={DAILY} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
  });

  it("renders 'No data' when daily is empty", () => {
    render(<TrendChart daily={[]} />);
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("does not render EChartsWrapper when daily is empty", () => {
    render(<TrendChart daily={[]} />);
    expect(screen.queryByTestId("echarts-wrapper")).toBeNull();
  });

  it("applies className to outer container", () => {
    const { container } = render(<TrendChart daily={DAILY} className="my-chart" />);
    expect(container.firstElementChild!.getAttribute("class")).toContain("my-chart");
  });

  it("renders without crash with single data point", () => {
    render(<TrendChart daily={[{ date: "2026-04-10", tokensIn: 1000, tokensOut: 500 }]} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
  });
});
