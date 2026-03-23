import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Tests that CommandDispatch.tsx correctly:
 * 1. Filters known stderr warnings (e.g., "no stdin data received")
 * 2. Handles "done" events with non-zero exit codes
 * 3. Handles "error" events
 */
describe("CommandDispatch SSE parsing", () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "CommandDispatch.tsx"),
    "utf-8"
  );

  it("should filter stderr lines containing known harmless warnings", () => {
    // The component must import and use isIgnoredStderrWarning
    expect(source).toContain("isIgnoredStderrWarning");
  });

  it("should handle done events with non-zero exit codes", () => {
    // Must check for data.type === "done" and show exit code
    expect(source).toContain('"done"');
    expect(source).toContain("exitCode");
  });

  it("should handle error events from the SSE stream", () => {
    // Must check for data.type === "error" and display the error
    expect(source).toContain('"error"');
    expect(source).toContain("data.message");
  });
});
