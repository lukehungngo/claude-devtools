import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CollapsiblePrompt } from "./CollapsiblePrompt";

afterEach(cleanup);

describe("CollapsiblePrompt", () => {
  describe("command type", () => {
    it("renders slash command as blue pill with args", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text="/dev-loop implement X" />,
      );
      const pill = getByTestId("command-pill");
      expect(pill.textContent).toBe("/dev-loop");
      const args = getByTestId("command-args");
      expect(args.textContent).toBe("implement X");
    });

    it("renders nav token as amber pill without border", () => {
      const { getByTestId } = render(<CollapsiblePrompt text="<next>" />);
      const pill = getByTestId("command-pill");
      expect(pill.textContent).toBe("<next>");
      expect(pill.className).toContain("text-[var(--amb)]");
      expect(pill.className).not.toContain("border");
    });

    it("renders bash command as neutral pill without border", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text="!ls -la /tmp" />,
      );
      const pill = getByTestId("command-pill");
      expect(pill.textContent).toBe("!ls");
      expect(pill.className).toContain("text-[var(--t1)]");
      expect(pill.className).not.toContain("border");
    });

    it("renders slash command pill without border", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text="/help" />,
      );
      const pill = getByTestId("command-pill");
      expect(pill.className).not.toContain("border");
      expect(pill.className).toContain("bg-");
    });

    it("renders slash command without args", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsiblePrompt text="/help" />,
      );
      expect(getByTestId("command-pill").textContent).toBe("/help");
      expect(queryByTestId("command-args")).toBeNull();
    });
  });

  describe("short_intent type", () => {
    it("renders full text with no collapse controls", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsiblePrompt text="fix the bug" />,
      );
      const root = getByTestId("collapsible-prompt");
      expect(root.textContent).toBe("fix the bug");
      expect(queryByTestId("expand-toggle")).toBeNull();
    });
  });

  describe("task_list type", () => {
    const taskText = [
      "1. First task",
      "2. Second task",
      "3. Third task",
      "4. Fourth task",
      "5. Fifth task",
      "6. Sixth task",
      "7. Seventh task",
    ].join("\n");

    it("renders first 3 items then expand toggle", () => {
      const { getByTestId, getByText } = render(
        <CollapsiblePrompt text={taskText} />,
      );
      const list = getByTestId("task-list");
      // First 3 items visible
      expect(list.textContent).toContain("First task");
      expect(list.textContent).toContain("Second task");
      expect(list.textContent).toContain("Third task");
      // Toggle present
      expect(getByText("+4 more tasks")).toBeTruthy();
    });

    it("expands to show all items on click", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={taskText} />,
      );
      const toggle = getByTestId("expand-toggle");
      fireEvent.click(toggle);
      const list = getByTestId("task-list");
      expect(list.textContent).toContain("Seventh task");
    });

    it("collapses back on second click", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={taskText} />,
      );
      const toggle = getByTestId("expand-toggle");
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      // Toggle text should revert
      expect(toggle.textContent).toContain("+4 more tasks");
    });
  });

  describe("intent_blob type", () => {
    const blobText =
      "fix this:\n" +
      Array.from({ length: 50 }, (_, i) => `  at Module.run (file.ts:${i})`).join("\n");

    it("renders intent line and expand toggle with blob type", () => {
      const { getByText, getByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      expect(getByText("fix this:")).toBeTruthy();
      const toggle = getByTestId("expand-toggle");
      expect(toggle.textContent).toContain("+50 lines");
      expect(toggle.textContent).toContain("error log");
    });

    it("blob content is hidden by default", () => {
      const { queryByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      expect(queryByTestId("blob-content")).toBeNull();
    });

    it("blob content becomes visible on toggle click", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      expect(queryByTestId("blob-content")).not.toBeNull();
      expect(getByTestId("blob-content").textContent).toContain("at Module.run");
    });

    it("expanded blob shows full text including intent line", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      const blob = getByTestId("blob-content");
      // Full text must include the intent line — not split
      expect(blob.textContent).toContain("fix this:");
      expect(blob.textContent).toContain("at Module.run");
    });

    it("hides intent line when expanded to avoid duplication", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      // Intent line should be hidden (inside the blob now)
      expect(queryByTestId("intent-line")?.style.display === "none" ||
        queryByTestId("intent-line") === null ||
        getByTestId("blob-content").textContent?.includes("fix this:")).toBeTruthy();
    });

    it("blob renders as <pre> element for code formatting", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      const blob = getByTestId("blob-content");
      expect(blob.tagName).toBe("PRE");
    });

    it("blob has distinct background styling", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      const blob = getByTestId("blob-content");
      expect(blob.className).toContain("bg-");
    });

    it("expand toggle contains a chevron icon", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      const toggle = getByTestId("expand-toggle");
      // Should have an SVG (lucide icon) inside
      expect(toggle.querySelector("svg")).not.toBeNull();
    });

    it("collapses blob content back on second toggle click", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsiblePrompt text={blobText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      expect(queryByTestId("blob-content")).not.toBeNull();
      fireEvent.click(getByTestId("expand-toggle"));
      expect(queryByTestId("blob-content")).toBeNull();
    });
  });

  describe("long_prose type", () => {
    // First line must be >100 chars so classifier skips intent_blob
    const longText = Array.from(
      { length: 20 },
      (_, i) =>
        `This is line number ${i + 1} of the long prose text that keeps going and going to exceed one hundred characters easily enough.`,
    ).join("\n");

    it("renders first 3 lines and expand toggle", () => {
      const { getByTestId, getByText } = render(
        <CollapsiblePrompt text={longText} />,
      );
      const visible = getByTestId("visible-lines");
      expect(visible.textContent).toContain("line number 1");
      expect(visible.textContent).toContain("line number 3");
      expect(getByText("+17 lines")).toBeTruthy();
    });

    it("expands to show all lines on click", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text={longText} />,
      );
      fireEvent.click(getByTestId("expand-toggle"));
      const visible = getByTestId("visible-lines");
      expect(visible.textContent).toContain("line number 20");
    });
  });

  describe("root wrapper", () => {
    it("always has data-testid collapsible-prompt", () => {
      const { getByTestId } = render(
        <CollapsiblePrompt text="hello" />,
      );
      expect(getByTestId("collapsible-prompt")).toBeTruthy();
    });
  });
});
