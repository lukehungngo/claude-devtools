import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis tests for the /command endpoint.
 * Verifies that routes.ts uses the Agent SDK via SessionManager
 * instead of raw spawn.
 */
describe("POST /command — Agent SDK integration", () => {
  const routesSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "routes.ts"),
    "utf-8"
  );

  it("should use sessionManager.sendPrompt instead of raw spawn", () => {
    // Must NOT contain raw spawn("claude") for command dispatch
    const rawSpawnIndex = routesSource.indexOf('spawn("claude"');
    expect(rawSpawnIndex).toBe(-1);

    // Must use sessionManager.sendPrompt
    const sdkIndex = routesSource.indexOf("sessionManager.sendPrompt");
    expect(sdkIndex).toBeGreaterThan(-1);
  });

  it("should require sessionId in the request body", () => {
    // The endpoint must check for sessionId
    expect(routesSource).toContain("Missing sessionId");
  });

  it("should import sessionManager from sessions module", () => {
    expect(routesSource).toContain("session-manager");
  });

  it("should stream SDK messages as SSE events", () => {
    // Must iterate over query with for-await
    expect(routesSource).toContain("for await");
    // Must convert SDK messages to SSE format
    expect(routesSource).toContain("sdkMessageToSSE");
  });

  it("should clean up session on client disconnect", () => {
    expect(routesSource).toContain('req.on("close"');
    expect(routesSource).toContain("closeSession");
  });
});
