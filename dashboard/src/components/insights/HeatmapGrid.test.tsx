import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { InsightsHeatmapCell } from "../../lib/types.js";

vi.mock("./EChartsWrapper.js", () => ({
  EChartsWrapper: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="echarts-wrapper" className={className ?? ""} />
  )),
}));

import { HeatmapGrid, buildHeatmapOption } from "./HeatmapGrid";

afterEach(cleanup);

function makeFullGrid(override?: Partial<InsightsHeatmapCell>): InsightsHeatmapCell[] {
  const cells: InsightsHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ day: d, hour: h, intensity: 0 });
    }
  }
  if (override) {
    const idx = cells.findIndex(
      (c) => c.day === override.day && c.hour === override.hour
    );
    if (idx >= 0) Object.assign(cells[idx], override);
  }
  return cells;
}

describe("buildHeatmapOption", () => {
  it("returns option with series type heatmap", () => {
    const option = buildHeatmapOption(makeFullGrid());
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe("heatmap");
  });

  it("series data has 168 points for full 7x24 grid", () => {
    const option = buildHeatmapOption(makeFullGrid());
    const series = option.series as Array<{ data: unknown[] }>;
    expect(series[0].data).toHaveLength(168);
  });

  it("each data point is [hour, day, intensity]", () => {
    const cells = makeFullGrid({ day: 2, hour: 15, intensity: 4 });
    const option = buildHeatmapOption(cells);
    const series = option.series as Array<{ data: Array<[number, number, number]> }>;
    const targetPoint = series[0].data.find(
      ([h, d]) => h === 15 && d === 2
    );
    expect(targetPoint).toBeDefined();
    expect(targetPoint![2]).toBe(4);
  });

  it("yAxis.data contains 7 day labels", () => {
    const option = buildHeatmapOption(makeFullGrid());
    const yAxis = option.yAxis as { data: string[] };
    expect(yAxis.data).toHaveLength(7);
    expect(yAxis.data).toContain("Mon");
    expect(yAxis.data).toContain("Sun");
  });

  it("xAxis.data contains 24 hour labels", () => {
    const option = buildHeatmapOption(makeFullGrid());
    const xAxis = option.xAxis as { data: number[] };
    expect(xAxis.data).toHaveLength(24);
  });

  it("visualMap min/max is 0/4 matching intensity range", () => {
    const option = buildHeatmapOption(makeFullGrid());
    const vm = option.visualMap as { min: number; max: number };
    expect(vm.min).toBe(0);
    expect(vm.max).toBe(4);
  });
});

describe("HeatmapGrid component", () => {
  it("renders EChartsWrapper with heatmap data", () => {
    render(<HeatmapGrid heatmap={makeFullGrid()} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
  });

  it("renders without crash when heatmap is empty", () => {
    render(<HeatmapGrid heatmap={[]} />);
    expect(screen.getByTestId("echarts-wrapper")).toBeTruthy();
  });

  it("applies className to outer container", () => {
    const { container } = render(
      <HeatmapGrid heatmap={makeFullGrid()} className="my-grid" />
    );
    expect(container.firstElementChild!.getAttribute("class")).toContain("my-grid");
  });
});
