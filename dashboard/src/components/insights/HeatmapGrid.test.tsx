import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { InsightsHeatmapCell } from "../../lib/types.js";
import { HeatmapGrid, findPeakCell, fmtHeatmapHour } from "./HeatmapGrid.js";

afterEach(cleanup);

function makeGrid(overrides: Partial<InsightsHeatmapCell>[] = []): InsightsHeatmapCell[] {
  const cells: InsightsHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ day: d, hour: h, intensity: 0 });
    }
  }
  for (const o of overrides) {
    const idx = cells.findIndex(c => c.day === o.day && c.hour === o.hour);
    if (idx >= 0) Object.assign(cells[idx], o);
  }
  return cells;
}

describe("findPeakCell", () => {
  it("returns null for all-zero grid", () => {
    expect(findPeakCell(makeGrid())).toBeNull();
  });

  it("returns cell with highest intensity", () => {
    const cells = makeGrid([{ day: 2, hour: 14, intensity: 4 }]);
    const peak = findPeakCell(cells);
    expect(peak).not.toBeNull();
    expect(peak!.day).toBe(2);
    expect(peak!.hour).toBe(14);
  });
});

describe("fmtHeatmapHour", () => {
  it("formats midnight as 12AM", () => {
    expect(fmtHeatmapHour(0)).toBe("12AM");
  });
  it("formats noon as 12PM", () => {
    expect(fmtHeatmapHour(12)).toBe("12PM");
  });
  it("formats 3am correctly", () => {
    expect(fmtHeatmapHour(3)).toBe("3AM");
  });
  it("formats 9pm correctly", () => {
    expect(fmtHeatmapHour(21)).toBe("9PM");
  });
});

describe("HeatmapGrid component", () => {
  it("renders 168 cells for 7×24 grid", () => {
    const { container } = render(<HeatmapGrid heatmap={makeGrid()} />);
    const cells = container.querySelectorAll("[data-testid='hm-cell']");
    expect(cells).toHaveLength(168);
  });

  it("renders 7 day labels", () => {
    render(<HeatmapGrid heatmap={makeGrid()} />);
    const labels = screen.getAllByTestId("hm-day-label");
    expect(labels).toHaveLength(7);
  });

  it("renders 24 hour label slots", () => {
    const { container } = render(<HeatmapGrid heatmap={makeGrid()} />);
    const slots = container.querySelectorAll("[data-testid='hm-hour-label']");
    expect(slots).toHaveLength(24);
  });

  it("peak cell has outline style", () => {
    const cells = makeGrid([{ day: 1, hour: 23, intensity: 4 }]);
    const { container } = render(<HeatmapGrid heatmap={cells} />);
    const peakCell = container.querySelector("[data-testid='hm-cell-peak']");
    expect(peakCell).not.toBeNull();
    expect(peakCell!.getAttribute("style")).toMatch(/outline/);
  });

  it("renders legend swatches", () => {
    const { container } = render(<HeatmapGrid heatmap={makeGrid()} />);
    const swatches = container.querySelectorAll("[data-testid='hm-swatch']");
    expect(swatches).toHaveLength(5);
  });

  it("applies className to outer container", () => {
    const { container } = render(<HeatmapGrid heatmap={makeGrid()} className="my-grid" />);
    expect(container.firstElementChild!.getAttribute("class")).toContain("my-grid");
  });

  it("renders without crash when heatmap is empty", () => {
    const { container } = render(<HeatmapGrid heatmap={[]} />);
    expect(container.firstElementChild).not.toBeNull();
  });
});
