import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NarrationGroup } from "./NarrationGroup";

afterEach(cleanup);

describe("NarrationGroup", () => {
  it("renders nothing for empty items", () => {
    const { container } = render(<NarrationGroup items={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all items are whitespace", () => {
    const { container } = render(<NarrationGroup items={["  ", "\n", ""]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders collapsed header with step count and char count", () => {
    render(
      <NarrationGroup items={["Let me check...", "Now I see...", "Let me verify..."]} />,
    );
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText(/3 steps/)).toBeTruthy();
    // Body should not be visible when collapsed
    expect(screen.queryByText("Let me check...")).toBeNull();
  });

  it("renders single item without step count", () => {
    render(<NarrationGroup items={["Let me check the file"]} />);
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText(/chars$/)).toBeTruthy();
    expect(screen.queryByText(/steps/)).toBeNull();
  });

  it("expands body on click", () => {
    render(
      <NarrationGroup items={["Let me check...", "Now I see..."]} />,
    );
    fireEvent.click(screen.getByText("Working"));
    expect(screen.getByText("Let me check...")).toBeTruthy();
    expect(screen.getByText("Now I see...")).toBeTruthy();
  });

  it("collapses body on second click", () => {
    render(<NarrationGroup items={["Let me check..."]} />);
    const header = screen.getByText("Working");
    fireEvent.click(header);
    expect(screen.getByText("Let me check...")).toBeTruthy();
    fireEvent.click(header);
    expect(screen.queryByText("Let me check...")).toBeNull();
  });

  it("filters out empty items from count", () => {
    render(<NarrationGroup items={["Hello", "", "  ", "World"]} />);
    expect(screen.getByText(/2 steps/)).toBeTruthy();
  });
});
