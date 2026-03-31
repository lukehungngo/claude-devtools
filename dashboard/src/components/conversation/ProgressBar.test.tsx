import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("renders label, count, and correct fill width for 5/10", () => {
    const { getByText, getByRole } = render(
      <ProgressBar label="Tasks" completed={5} total={10} />
    );

    expect(getByText("Tasks")).toBeTruthy();
    expect(getByText("5/10")).toBeTruthy();

    const bar = getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });

  it("renders 10/10 with 100% fill and green count color", () => {
    const { getByText, getByRole } = render(
      <ProgressBar label="Tasks" completed={10} total={10} />
    );

    const countEl = getByText("10/10");
    expect(countEl).toBeTruthy();
    expect(countEl.style.color).toBe("var(--grn)");

    const bar = getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("renders 0/10 with 0% fill", () => {
    const { getByText, getByRole } = render(
      <ProgressBar label="Tasks" completed={0} total={10} />
    );

    expect(getByText("0/10")).toBeTruthy();

    const bar = getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("returns null when total is 0", () => {
    const { container } = render(
      <ProgressBar label="Tasks" completed={0} total={0} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("clamps fill width to 100% when completed exceeds total", () => {
    const { getByRole } = render(
      <ProgressBar label="Tasks" completed={15} total={10} />
    );

    const bar = getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    // Must never exceed 100%
    const widthNum = parseFloat(fill.style.width);
    expect(widthNum).toBeLessThanOrEqual(100);
    expect(fill.style.width).toBe("100%");
  });

  it("has progressbar role with correct aria attributes", () => {
    const { getByRole } = render(
      <ProgressBar label="Tasks" completed={3} total={8} />
    );

    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
  });
});
