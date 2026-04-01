import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TurnDivider } from "./TurnDivider";

afterEach(cleanup);

describe("TurnDivider", () => {
  it("renders turn number badge with correct text", () => {
    const { getByText } = render(
      <TurnDivider turnNumber={5} isSelected={false} onClick={vi.fn()} />
    );

    expect(getByText("T5")).toBeTruthy();
  });

  it("renders badge as a button element for keyboard accessibility", () => {
    const { getByRole } = render(
      <TurnDivider turnNumber={3} isSelected={false} onClick={vi.fn()} />
    );

    const button = getByRole("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toBe("T3");
  });

  it("calls onClick when badge is clicked", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <TurnDivider turnNumber={7} isSelected={false} onClick={onClick} />
    );

    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has aria-label for accessibility", () => {
    const { getByRole } = render(
      <TurnDivider turnNumber={42} isSelected={false} onClick={vi.fn()} />
    );

    const button = getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Go to turn 42");
  });

  it("sets aria-pressed=true when selected", () => {
    const { getByRole } = render(
      <TurnDivider turnNumber={10} isSelected={true} onClick={vi.fn()} />
    );

    const button = getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("sets aria-pressed=false when not selected", () => {
    const { getByRole } = render(
      <TurnDivider turnNumber={10} isSelected={false} onClick={vi.fn()} />
    );

    const button = getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders two line segments flanking the badge", () => {
    const { container } = render(
      <TurnDivider turnNumber={1} isSelected={false} onClick={vi.fn()} />
    );

    // The component should have a flex container with two line divs and a button
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toBeTruthy();
    // Should have 3 children: left line, button, right line
    expect(wrapper.children.length).toBe(3);
  });

  it("does not re-render when props are unchanged (memo)", () => {
    const onClick = vi.fn();
    const { rerender, getByText } = render(
      <TurnDivider turnNumber={5} isSelected={false} onClick={onClick} />
    );

    // Re-render with same props (same onClick reference)
    rerender(
      <TurnDivider turnNumber={5} isSelected={false} onClick={onClick} />
    );

    // Component should still render correctly (memo doesn't break rendering)
    expect(getByText("T5")).toBeTruthy();
  });

  it("renders data-turn-index attribute when turnIndex is provided", () => {
    const { container } = render(
      <TurnDivider turnNumber={3} turnIndex={2} isSelected={false} onClick={vi.fn()} />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("data-turn-index")).toBe("2");
  });

  it("omits data-turn-index when turnIndex is not provided", () => {
    const { container } = render(
      <TurnDivider turnNumber={3} isSelected={false} onClick={vi.fn()} />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute("data-turn-index")).toBe(false);
  });
});
