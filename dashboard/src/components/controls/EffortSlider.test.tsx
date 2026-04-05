import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EffortSlider } from "./EffortSlider";
import type { EffortLevel } from "../../lib/types";

function renderSlider(
  overrides: Partial<{
    level: EffortLevel;
    onChange: (level: EffortLevel) => void;
  }> = {},
) {
  const props = {
    level: overrides.level ?? ("medium" as EffortLevel),
    onChange: overrides.onChange ?? vi.fn(),
  };
  return { ...render(<EffortSlider {...props} />), props };
}

describe("EffortSlider", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders current effort level text", () => {
    renderSlider({ level: "high" });
    expect(screen.getByTestId("effort-slider-trigger").textContent).toContain("high");
  });

  // P1-3: Only 3 valid levels (low, medium, high) — "max" is not supported by server
  it("shows only 3 levels (low, medium, high) on click — no max", () => {
    renderSlider();
    expect(screen.queryByTestId("effort-slider-dropdown")).toBeNull();
    fireEvent.click(screen.getByTestId("effort-slider-trigger"));
    const dropdown = screen.getByTestId("effort-slider-dropdown");
    expect(dropdown).toBeDefined();
    for (const level of ["low", "medium", "high"]) {
      expect(dropdown.textContent).toContain(level);
    }
    // "max" must NOT appear
    const buttons = dropdown.querySelectorAll("button");
    const buttonTexts = Array.from(buttons).map((b) => b.textContent);
    expect(buttonTexts).not.toContain("max");
  });

  it("calls onChange with selected level", () => {
    const onChange = vi.fn();
    renderSlider({ onChange, level: "low" });
    fireEvent.click(screen.getByTestId("effort-slider-trigger"));
    fireEvent.click(screen.getByText("high"));
    expect(onChange).toHaveBeenCalledWith("high");
  });

  it("closes dropdown after selection", () => {
    renderSlider();
    fireEvent.click(screen.getByTestId("effort-slider-trigger"));
    expect(screen.getByTestId("effort-slider-dropdown")).toBeDefined();
    fireEvent.click(screen.getByText("high"));
    expect(screen.queryByTestId("effort-slider-dropdown")).toBeNull();
  });

  it("highlights current level in dropdown", () => {
    renderSlider({ level: "medium" });
    fireEvent.click(screen.getByTestId("effort-slider-trigger"));
    const options = screen.getByTestId("effort-slider-dropdown").querySelectorAll("button");
    const mediumOption = Array.from(options).find((btn) => btn.textContent === "medium");
    expect(mediumOption).toBeDefined();
    expect(mediumOption!.style.background).toBe("var(--bg-h)");
  });
});
