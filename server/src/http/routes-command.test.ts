import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis test: verifies that routes.ts calls child.stdin.end()
 * after spawning the child process. This prevents the "no stdin data
 * received in 3s" warning from Claude CLI.
 */
describe("POST /command stdin handling", () => {
  it("should call child.stdin.end() after spawn to prevent stdin warning", () => {
    const routesSource = fs.readFileSync(
      path.resolve(import.meta.dirname, "routes.ts"),
      "utf-8"
    );

    // Find the spawn call and verify stdin.end() follows it
    const spawnIndex = routesSource.indexOf('spawn("claude"');
    expect(spawnIndex).toBeGreaterThan(-1);

    // After spawn, there must be a child.stdin.end() call
    const afterSpawn = routesSource.slice(spawnIndex);
    const stdinEndIndex = afterSpawn.indexOf("child.stdin.end()");
    expect(stdinEndIndex).toBeGreaterThan(-1);

    // stdin.end() must come before the SSE header setup or stdout/stderr listeners
    const stdoutOnIndex = afterSpawn.indexOf('child.stdout.on("data"');
    expect(stdinEndIndex).toBeLessThan(stdoutOnIndex);
  });
});
