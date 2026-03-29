import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { StreamingThinking } from "./StreamingThinking";

afterEach(cleanup);

describe("StreamingThinking", () => {
  it("renders thinking text", () => {
    const { container } = render(
      <StreamingThinking text="Analyzing the code..." isComplete={false} />
    );
    expect(container.textContent).toContain("Analyzing the code...");
  });

  it("shows cursor indicator when not complete", () => {
    const { container } = render(
      <StreamingThinking text="Thinking..." isComplete={false} />
    );
    const cursor = container.querySelector("[data-testid='thinking-cursor']");
    expect(cursor).not.toBeNull();
  });

  it("hides cursor when complete", () => {
    const { container } = render(
      <StreamingThinking text="Done thinking." isComplete={true} />
    );
    const cursor = container.querySelector("[data-testid='thinking-cursor']");
    expect(cursor).toBeNull();
  });

  it("renders with purple left border", () => {
    const { container } = render(
      <StreamingThinking text="Some thought" isComplete={false} />
    );
    const block = container.firstElementChild;
    expect(block?.className).toContain("border-l");
    expect(block?.className).toContain("border-dt-purple");
  });

  it("is collapsible when text is long", () => {
    const longText = "Line one\nLine two\nLine three\nLine four\nLine five";
    const { container, getByRole } = render(
      <StreamingThinking text={longText} isComplete={true} />
    );
    const toggleBtn = getByRole("button");
    expect(toggleBtn).toBeDefined();
    // Click to expand
    fireEvent.click(toggleBtn);
    expect(container.textContent).toContain("Line five");
  });

  it("does not render when text is empty", () => {
    const { container } = render(
      <StreamingThinking text="" isComplete={false} />
    );
    expect(container.firstElementChild).toBeNull();
  });
});
