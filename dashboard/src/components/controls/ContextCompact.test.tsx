import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ContextCompact } from "./ContextCompact";

afterEach(cleanup);

describe("ContextCompact", () => {
  it("renders context percentage and bar", () => {
    render(<ContextCompact percent={35} onCompact={() => {}} />);
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByTestId("context-bar-fill")).toBeTruthy();
  });

  it("shows compact button when percent > 50", () => {
    render(<ContextCompact percent={65} onCompact={() => {}} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("hides compact button when percent <= 50", () => {
    render(<ContextCompact percent={50} onCompact={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onCompact when button clicked", () => {
    const onCompact = vi.fn();
    render(<ContextCompact percent={75} onCompact={onCompact} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it("has data-testid on bar fill for >= 80% case", () => {
    render(<ContextCompact percent={85} onCompact={() => {}} />);
    const fill = screen.getByTestId("context-bar-fill");
    expect(fill).toBeTruthy();
    // At 85%, bar should be red-colored (width should reflect percent)
    expect(fill.style.width).toBe("85%");
  });
});
