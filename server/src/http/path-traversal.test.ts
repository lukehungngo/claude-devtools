import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import path from "node:path";

/**
 * Reproduction test for path traversal bypass via sibling directory prefix.
 *
 * Bug: `resolvedTarget.startsWith(resolvedCwd)` allows escaping to sibling
 * directories whose names share the cwd prefix. E.g., cwd="/home/user/project"
 * and target="/home/user/project-secrets" passes the check because
 * "/home/user/project-secrets".startsWith("/home/user/project") is true.
 */

// Extract the security check logic to test it in isolation
function isWithinCwd(resolvedCwd: string, resolvedTarget: string): boolean {
  // Current (buggy) implementation from routes.ts line 203
  return resolvedTarget.startsWith(resolvedCwd);
}

function isWithinCwdFixed(resolvedCwd: string, resolvedTarget: string): boolean {
  return (
    resolvedTarget.startsWith(resolvedCwd + path.sep) ||
    resolvedTarget === resolvedCwd
  );
}

describe("path traversal: sibling directory prefix bypass", () => {
  const cwd = "/home/user/project";

  it("buggy check allows sibling directory with shared prefix", () => {
    const sibling = "/home/user/project-secrets";
    // This SHOULD be rejected but the buggy check allows it
    expect(isWithinCwd(cwd, sibling)).toBe(true); // BUG: passes when it shouldn't
  });

  it("fixed check rejects sibling directory with shared prefix", () => {
    const sibling = "/home/user/project-secrets";
    expect(isWithinCwdFixed(cwd, sibling)).toBe(false);
  });

  it("fixed check allows legitimate child paths", () => {
    const child = "/home/user/project/src/file.ts";
    expect(isWithinCwdFixed(cwd, child)).toBe(true);
  });

  it("fixed check allows cwd itself", () => {
    expect(isWithinCwdFixed(cwd, cwd)).toBe(true);
  });

  it("fixed check rejects parent traversal", () => {
    const parent = resolve(cwd, "..");
    expect(isWithinCwdFixed(cwd, parent)).toBe(false);
  });
});
