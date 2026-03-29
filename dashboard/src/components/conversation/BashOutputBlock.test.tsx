/**
 * Tests for BashOutputBlock component (P1-07)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { BashOutputBlock } from "./BashOutputBlock";

afterEach(() => {
  cleanup();
});

describe("BashOutputBlock", () => {
  it("renders command with $ prefix", () => {
    render(
      <BashOutputBlock command="ls src/" stdout="App.tsx\nindex.ts" stderr="" exitCode={0} />
    );

    expect(screen.getByText("$ ls src/")).toBeTruthy();
  });

  it("shows green exit 0 badge for success", () => {
    render(
      <BashOutputBlock command="echo hi" stdout="hi" stderr="" exitCode={0} />
    );

    const badge = screen.getByLabelText(/Exit code 0, success/);
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("exit 0");
  });

  it("shows red exit code badge for failure", () => {
    render(
      <BashOutputBlock command="false" stdout="" stderr="error" exitCode={1} />
    );

    const badge = screen.getByLabelText(/Exit code 1, failure/);
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("exit 1");
  });

  it("renders stdout output in monospace block", () => {
    render(
      <BashOutputBlock command="ls" stdout="file1\nfile2\nfile3" stderr="" exitCode={0} />
    );

    expect(screen.getByText(/file1/)).toBeTruthy();
    expect(screen.getByText(/file2/)).toBeTruthy();
  });

  it("shows stderr when present", () => {
    render(
      <BashOutputBlock command="bad" stdout="" stderr="command not found" exitCode={127} />
    );

    expect(screen.getByText(/command not found/)).toBeTruthy();
  });

  it("shows 'No output' when both stdout and stderr are empty", () => {
    render(
      <BashOutputBlock command="true" stdout="" stderr="" exitCode={0} />
    );

    expect(screen.getByText("No output")).toBeTruthy();
  });

  it("has role=log for accessibility", () => {
    const { container } = render(
      <BashOutputBlock command="ls" stdout="file" stderr="" exitCode={0} />
    );

    const logRegion = container.querySelector('[role="log"]');
    expect(logRegion).not.toBeNull();
  });

  it("collapses long output and shows expand button", () => {
    const longOutput = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    render(
      <BashOutputBlock command="cat big.txt" stdout={longOutput} stderr="" exitCode={0} />
    );

    // Should show truncation button
    const expandBtn = screen.getByText(/more lines/);
    expect(expandBtn).toBeTruthy();

    // Click to expand
    fireEvent.click(expandBtn);

    // After expansion, all lines should be visible
    expect(screen.getByText(/line 20/)).toBeTruthy();
  });

  it("strips ANSI escape codes from output", () => {
    const ansiOutput = "\x1b[32mgreen text\x1b[0m normal";
    render(
      <BashOutputBlock command="echo" stdout={ansiOutput} stderr="" exitCode={0} />
    );

    expect(screen.getByText(/green text/)).toBeTruthy();
    // ANSI codes should not be in the rendered text
    const pre = screen.getByText(/green text/);
    expect(pre.textContent).not.toContain("\x1b");
  });
});
