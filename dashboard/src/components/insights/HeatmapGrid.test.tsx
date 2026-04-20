import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { InsightsHeatmapCell } from "../../lib/types.js";
import { HeatmapGrid } from "./HeatmapGrid";

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

describe("HeatmapGrid component", () => {
  it("renders 168 cells for full 7×24 grid", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    // 7 rows × 24 cols = 168 cells in the grid
    const grid = container.querySelector("[style*='repeat(24, 1fr)']");
    expect(grid).not.toBeNull();
    expect(grid!.children.length).toBe(168);
  });

  it("renders without crash when heatmap is empty", () => {
    const { container } = render(<HeatmapGrid heatmap={[]} />);
    expect(container.firstElementChild).not.toBeNull();
  });

  it("applies className to outer container", () => {
    const { container } = render(
      <HeatmapGrid heatmap={makeFullGrid()} className="my-grid" />
    );
    expect(container.firstElementChild!.getAttribute("class")).toContain("my-grid");
  });

  it("shows all 7 day labels", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    const text = container.textContent ?? "";
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(text).toContain(day);
    }
  });

  it("shows tooltip with day and hour on cell hover", () => {
    const cells = makeFullGrid({ day: 2, hour: 15, intensity: 3 });
    const { container } = render(<HeatmapGrid heatmap={cells} />);
    const gridEl = container.querySelector("[style*='repeat(24, 1fr)']")!;
    // cell index = day * 24 + hour = 2*24 + 15 = 63
    const targetCell = gridEl.children[63] as HTMLElement;
    fireEvent.mouseEnter(targetCell);
    expect(container.textContent).toContain("Wed");
    expect(container.textContent).toContain("15:00");
  });

  it("hides tooltip on cell mouse leave", () => {
    const cells = makeFullGrid({ day: 0, hour: 8, intensity: 2 });
    const { container } = render(<HeatmapGrid heatmap={cells} />);
    const gridEl = container.querySelector("[style*='repeat(24, 1fr)']")!;
    const targetCell = gridEl.children[8] as HTMLElement;
    fireEvent.mouseEnter(targetCell);
    fireEvent.mouseLeave(targetCell);
    // tooltip should be gone — "Mon" day label still there but tooltip content gone
    const tooltipDivs = container.querySelectorAll("[style*='zIndex: 20']");
    expect(tooltipDivs.length).toBe(0);
  });

  it("shows intensity label in tooltip", () => {
    const cells = makeFullGrid({ day: 1, hour: 10, intensity: 4 });
    const { container } = render(<HeatmapGrid heatmap={cells} />);
    const gridEl = container.querySelector("[style*='repeat(24, 1fr)']")!;
    const targetCell = gridEl.children[1 * 24 + 10] as HTMLElement;
    fireEvent.mouseEnter(targetCell);
    expect(container.textContent).toContain("Peak");
  });

  it("shows legend with Less/More labels", () => {
    const { container } = render(<HeatmapGrid heatmap={makeFullGrid()} />);
    expect(container.textContent).toContain("Less");
    expect(container.textContent).toContain("More");
  });
});
