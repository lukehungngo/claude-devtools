import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HeatmapGrid } from "./HeatmapGrid.js";
import type { InsightsHeatmapCell } from "../../lib/types.js";

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

describe("HeatmapGrid", () => {
  it("renders 168 cells (7 days × 24 hours)", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    const cells = container.querySelectorAll("[data-testid^='heatmap-cell-']");
    expect(cells).toHaveLength(168);
  });

  it("renders cell with correct data-testid format", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    expect(container.querySelector("[data-testid='heatmap-cell-0-0']")).not.toBeNull();
    expect(container.querySelector("[data-testid='heatmap-cell-6-23']")).not.toBeNull();
  });

  it("applies intensity-4 class for max intensity cell", () => {
    const cells = makeFullGrid({ day: 2, hour: 15, intensity: 4 });
    const { container } = render(<HeatmapGrid heatmap={cells} />);
    const cell = container.querySelector("[data-testid='heatmap-cell-2-15']");
    expect(cell?.className).toContain("intensity-4");
  });

  it("applies intensity-0 class for zero intensity cell", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    const cell = container.querySelector("[data-testid='heatmap-cell-0-0']");
    expect(cell?.className).toContain("intensity-0");
  });

  it("renders 7 day labels", () => {
    render(<HeatmapGrid heatmap={makeFullGrid()} />);
    for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
