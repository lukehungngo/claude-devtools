import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis tests for the /open-file endpoint (P2b).
 *
 * Verifies that filePath is validated against shell-safe characters before
 * being interpolated into an execSync shell string. The fix must either:
 * (a) use execFileSync with an argument array (no shell interpolation), or
 * (b) reject paths containing characters outside [a-zA-Z0-9_\-.\/]
 *
 * Without this guard, a path like /foo";rm -rf /;echo "bar passes the
 * existing absolute-path check but still injects into the shell command.
 */
describe("POST /open-file — shell metacharacter sanitization (P2b)", () => {
  const routesSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "routes.ts"),
    "utf-8"
  );

  it("should validate EDITOR env var against shell metacharacters before use in execSync", () => {
    // The EDITOR env var is user-controlled. If it contains shell metacharacters,
    // it could enable command injection when passed to execSync.
    // We look for a `.test(editor)` call — the editor variable must be validated
    // separately from filePath.
    const hasEditorTest = /\.test\(\s*editor\s*\)/.test(routesSource);
    expect(
      hasEditorTest,
      "routes.ts must validate the editor variable with a regex .test(editor) call before passing to execSync"
    ).toBe(true);
  });

  it("should use execFileSync instead of execSync for open-file, OR sanitize filePath before shell interpolation", () => {
    const usesExecFileSync = routesSource.includes("execFileSync");
    // If execFileSync is used the path is passed as an arg array — no injection risk.
    if (usesExecFileSync) {
      expect(usesExecFileSync).toBe(true);
      return;
    }

    // Otherwise a metacharacter guard must exist. The pattern rejects characters
    // outside the safe set. We verify the regex literal is present.
    // The safe-char test: /[^a-zA-Z0-9_\-./]/.test(filePath) → reject
    const hasSafeCharRegex = /\[.*\^.*a-zA-Z0-9.*_.*\\?-.*\..*\/?\]/.test(
      routesSource
    );
    expect(
      hasSafeCharRegex,
      "routes.ts must either use execFileSync or validate filePath with a safe-char regex before calling execSync"
    ).toBe(true);
  });
});
