import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ToolResultBlock } from "./ToolResultBlock";

afterEach(cleanup);

describe("ToolResultBlock", () => {
  it("renders string content in a pre block", () => {
    const { container } = render(
      <ToolResultBlock content="hello world" isError={false} toolName="Read" />
    );
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("hello world");
  });

  it("renders error content with red border", () => {
    const { container } = render(
      <ToolResultBlock content="command failed" isError={true} toolName="Bash" />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("border-dt-red");
  });

  it("renders non-error content with default border", () => {
    const { container } = render(
      <ToolResultBlock content="ok" isError={false} toolName="Read" />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("border-dt-border");
  });

  it("collapses long content (> 5 lines) by default", () => {
    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container } = render(
      <ToolResultBlock content={longContent} isError={false} toolName="Bash" />
    );
    const pre = container.querySelector("pre");
    // Should show only first 3 lines when collapsed
    expect(pre!.textContent).toContain("line 1");
    expect(pre!.textContent).toContain("line 2");
    expect(pre!.textContent).toContain("line 3");
    expect(pre!.textContent).not.toContain("line 4");
    // Should show "more lines" indicator
    expect(container.textContent).toContain("7 more lines");
  });

  it("expands collapsed content on click", () => {
    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container, getByText } = render(
      <ToolResultBlock content={longContent} isError={false} toolName="Bash" />
    );
    const expandBtn = getByText(/7 more lines/);
    fireEvent.click(expandBtn);
    const pre = container.querySelector("pre");
    expect(pre!.textContent).toContain("line 10");
  });

  it("shows 'Show more' for very long content (> 50 lines)", () => {
    const veryLongContent = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container, getByText } = render(
      <ToolResultBlock content={veryLongContent} isError={false} toolName="Bash" />
    );
    // First expand the collapsed view
    const expandBtn = getByText(/77 more lines/);
    fireEvent.click(expandBtn);
    // Now should be truncated at 50 lines with "Show more"
    expect(container.textContent).toContain("Show more");
    expect(container.querySelector("pre")!.textContent).toContain("line 50");
    expect(container.querySelector("pre")!.textContent).not.toContain("line 51");
  });

  it("renders array content as stringified JSON", () => {
    const arrayContent = [{ type: "text", text: "hello" }];
    const { container, getByText } = render(
      <ToolResultBlock content={arrayContent} isError={false} toolName="Read" />
    );
    // JSON.stringify produces 7 lines, so it's collapsed. Expand it.
    const expandBtn = getByText(/more lines/);
    fireEvent.click(expandBtn);
    const pre = container.querySelector("pre");
    expect(pre!.textContent).toContain('"hello"');
  });

  it("does not collapse short content (<=5 lines)", () => {
    const shortContent = "line 1\nline 2\nline 3";
    const { container } = render(
      <ToolResultBlock content={shortContent} isError={false} toolName="Read" />
    );
    expect(container.textContent).not.toContain("more lines");
    expect(container.querySelector("pre")!.textContent).toContain("line 3");
  });
});
