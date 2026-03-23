import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis test: verifies that routes.ts uses @anthropic-ai/claude-agent-sdk
 * instead of native child_process.spawn.
 */
describe("POST /command SDK usage", () => {
  it("should use claude-agent-sdk instead of spawn", () => {
    const routesSource = fs.readFileSync(
      path.resolve(import.meta.dirname, "routes.ts"),
      "utf-8"
    );

    // Verify it does NOT use child_process spawn
    expect(routesSource).not.toContain('spawn("claude"');
    
    // Verify it imports the SDK
    expect(routesSource).toContain('@anthropic-ai/claude-agent-sdk');
    
    // Verify it uses the query function
    expect(routesSource).toContain('query({');
    
    // Verify it passes abortController
    expect(routesSource).toContain('abortController: controller');
    
    // Verify it passes resume
    expect(routesSource).toContain('resume: sessionId');
  });
});
