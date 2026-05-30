import { describe, it, expect } from "vitest";
import { nextPanelWidth } from "./resizePanel";

const opts = { min: 320, maxFraction: 0.7 };

describe("nextPanelWidth", () => {
  it("widens the right panel when dragging the handle left (negative deltaX)", () => {
    // startWidth 400, dragged left 100px → 500 (within bounds)
    expect(nextPanelWidth(400, -100, 1000, opts)).toBe(500);
  });

  it("narrows when dragging right (positive deltaX)", () => {
    expect(nextPanelWidth(400, 50, 1000, opts)).toBe(350);
  });

  it("clamps to the minimum width", () => {
    expect(nextPanelWidth(400, 300, 1000, opts)).toBe(320);
  });

  it("clamps to maxFraction of the viewport", () => {
    // viewport 1000 * 0.7 = 700 max; raw would be 900
    expect(nextPanelWidth(600, -300, 1000, opts)).toBe(700);
  });

  it("is layout-independent (uses the drag delta, not absolute position)", () => {
    expect(nextPanelWidth(420, 0, 1440, opts)).toBe(420);
  });
});
