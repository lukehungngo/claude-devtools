import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ToolCallBlock } from "./ToolCallBlock";
import type { ToolUseContent } from "../../lib/types";

afterEach(cleanup);

function makeToolUse(overrides?: Partial<ToolUseContent>): ToolUseContent {
  return {
    type: "tool_use",
    id: "toolu_01ABC",
    name: "Read",
    input: { file_path: "/tmp/x.ts" },
    ...overrides,
  } as ToolUseContent;
}

describe("ToolCallBlock — FU-3 hover correlation", () => {
  it("renders a data-testid keyed by toolUseId", () => {
    render(<ToolCallBlock toolUse={makeToolUse()} />);
    expect(screen.getByTestId("tool-call-toolu_01ABC")).toBeDefined();
  });

  it("applies a 2px purple outline when highlighted={true}", () => {
    const { container } = render(
      <ToolCallBlock toolUse={makeToolUse()} highlighted={true} />,
    );
    const wrapper = container.querySelector(
      '[data-testid="tool-call-toolu_01ABC"]',
    ) as HTMLElement;
    expect(wrapper).not.toBeNull();
    const outline = wrapper.style.outline;
    expect(outline).toContain("2px");
    expect(outline).toContain("var(--cat-purple)");
  });

  it("does not apply outline when highlighted is false or undefined", () => {
    const { container } = render(<ToolCallBlock toolUse={makeToolUse()} />);
    const wrapper = container.querySelector(
      '[data-testid="tool-call-toolu_01ABC"]',
    ) as HTMLElement;
    expect(wrapper.style.outline ?? "").not.toContain("var(--cat-purple)");
  });

  it("fires onToolHover with toolUseId on mouseenter and null on mouseleave", () => {
    const onToolHover = vi.fn();
    render(
      <ToolCallBlock toolUse={makeToolUse()} onToolHover={onToolHover} />,
    );
    const wrapper = screen.getByTestId("tool-call-toolu_01ABC");
    fireEvent.mouseEnter(wrapper);
    expect(onToolHover).toHaveBeenCalledWith("toolu_01ABC");
    fireEvent.mouseLeave(wrapper);
    expect(onToolHover).toHaveBeenLastCalledWith(null);
  });
});
