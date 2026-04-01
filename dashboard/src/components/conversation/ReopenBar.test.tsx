import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReopenBar } from "./ReopenBar";

afterEach(cleanup);

describe("ReopenBar", () => {
  it("renders with Conversation label", () => {
    render(<ReopenBar onReopen={vi.fn()} />);
    expect(screen.getByText("Conversation")).toBeTruthy();
  });

  it("renders accessible button with correct aria-label", () => {
    render(<ReopenBar onReopen={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Open turn history panel" });
    expect(button).toBeTruthy();
  });

  it("calls onReopen when button is clicked", () => {
    const onReopen = vi.fn();
    render(<ReopenBar onReopen={onReopen} />);

    fireEvent.click(screen.getByRole("button", { name: "Open turn history panel" }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("has correct height and border styling", () => {
    const { container } = render(<ReopenBar onReopen={vi.fn()} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.height).toBe("30px");
    expect(bar.className).toContain("border-b");
    expect(bar.className).toContain("border-dt-border");
  });
});
