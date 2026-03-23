import { describe, it, expect } from "vitest";
import { isIgnoredStderrWarning } from "./filterStderrWarnings";

describe("isIgnoredStderrWarning", () => {
  it("filters out 'no stdin data received' warning", () => {
    expect(
      isIgnoredStderrWarning(
        "Warning: no stdin data received in 3s, proceeding without it..."
      )
    ).toBe(true);
  });

  it("filters out 'redirect stdin explicitly' warning", () => {
    expect(
      isIgnoredStderrWarning(
        "If this is intentional, redirect stdin explicitly: echo '' | claude"
      )
    ).toBe(true);
  });

  it("does not filter real stderr errors", () => {
    expect(isIgnoredStderrWarning("Error: command not found")).toBe(false);
  });

  it("does not filter empty strings", () => {
    expect(isIgnoredStderrWarning("")).toBe(false);
  });

  it("does not filter unrelated warnings", () => {
    expect(isIgnoredStderrWarning("Warning: file not found")).toBe(false);
  });
});
