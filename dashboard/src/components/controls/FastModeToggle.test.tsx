import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FastModeToggle } from "./FastModeToggle";

afterEach(cleanup);

describe("FastModeToggle", () => {
  it("renders 'Fast' text when disabled", () => {
    render(<FastModeToggle enabled={false} onToggle={() => {}} />);
    expect(screen.getByText("Fast")).toBeTruthy();
  });

  it("renders 'Fast' text when enabled", () => {
    render(<FastModeToggle enabled={true} onToggle={() => {}} />);
    expect(screen.getByText("Fast")).toBeTruthy();
  });

  it("calls onToggle exactly once when clicked", () => {
    const onToggle = vi.fn();
    render(<FastModeToggle enabled={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
