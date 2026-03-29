import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { DiffBlock } from "./DiffBlock";

afterEach(cleanup);

describe("DiffBlock", () => {
  it("renders old content as removed lines (red)", () => {
    const { container } = render(
      <DiffBlock oldContent="removed line" newContent="" filePath="src/foo.ts" />
    );
    // Expand first
    fireEvent.click(container.querySelector("button")!);
    const removedLine = container.querySelector("[data-testid='diff-removed']");
    expect(removedLine).not.toBeNull();
    expect(removedLine!.textContent).toContain("removed line");
    expect(removedLine!.className).toContain("text-dt-red");
    expect(removedLine!.className).toContain("bg-dt-red-dim");
  });

  it("renders new content as added lines (green)", () => {
    const { container } = render(
      <DiffBlock oldContent="" newContent="added line" filePath="src/foo.ts" />
    );
    fireEvent.click(container.querySelector("button")!);
    const addedLine = container.querySelector("[data-testid='diff-added']");
    expect(addedLine).not.toBeNull();
    expect(addedLine!.textContent).toContain("added line");
    expect(addedLine!.className).toContain("text-dt-green");
    expect(addedLine!.className).toContain("bg-dt-green-dim");
  });

  it("renders both removed and added lines for edit", () => {
    const { container } = render(
      <DiffBlock oldContent="old text" newContent="new text" filePath="src/bar.ts" />
    );
    fireEvent.click(container.querySelector("button")!);
    const removed = container.querySelectorAll("[data-testid='diff-removed']");
    const added = container.querySelectorAll("[data-testid='diff-added']");
    expect(removed.length).toBe(1);
    expect(added.length).toBe(1);
    expect(removed[0].textContent).toContain("old text");
    expect(added[0].textContent).toContain("new text");
  });

  it("shows file path as header", () => {
    const { container } = render(
      <DiffBlock oldContent="a" newContent="b" filePath="src/utils.ts" />
    );
    expect(container.textContent).toContain("src/utils.ts");
  });

  it("is collapsed by default", () => {
    const { container } = render(
      <DiffBlock oldContent="old" newContent="new" filePath="src/x.ts" />
    );
    // When collapsed, diff lines should not be visible
    const removed = container.querySelector("[data-testid='diff-removed']");
    const added = container.querySelector("[data-testid='diff-added']");
    expect(removed).toBeNull();
    expect(added).toBeNull();
    // Toggle button should be visible
    expect(container.textContent).toContain("Show diff");
  });

  it("expands when toggle is clicked", () => {
    const { container, getByText } = render(
      <DiffBlock oldContent="old" newContent="new" filePath="src/x.ts" />
    );
    fireEvent.click(getByText("Show diff"));
    const removed = container.querySelector("[data-testid='diff-removed']");
    expect(removed).not.toBeNull();
    // Toggle text should change
    expect(container.textContent).toContain("Hide diff");
  });

  it("handles multi-line content", () => {
    const { container } = render(
      <DiffBlock
        oldContent={"line1\nline2\nline3"}
        newContent={"lineA\nlineB"}
        filePath="src/multi.ts"
      />
    );
    fireEvent.click(container.querySelector("button")!);
    const removed = container.querySelectorAll("[data-testid='diff-removed']");
    const added = container.querySelectorAll("[data-testid='diff-added']");
    expect(removed.length).toBe(3);
    expect(added.length).toBe(2);
  });
});
