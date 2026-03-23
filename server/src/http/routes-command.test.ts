import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis tests: verify that routes.ts correctly uses
 * @anthropic-ai/claude-agent-sdk and handles all SDK message types
 * that are required to stream responses back to the client.
 */
describe("POST /command SDK usage", () => {
  const routesSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "routes.ts"),
    "utf-8"
  );

  it("should use claude-agent-sdk instead of spawn", () => {
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

  it("should enable includePartialMessages for real-time streaming", () => {
    // Without includePartialMessages: true, no stream_event messages are emitted
    // by the SDK, which means the client receives no output until the turn completes.
    expect(routesSource).toContain('includePartialMessages: true');
  });

  it("should handle assistant message type to extract text content", () => {
    // The SDK emits type:'assistant' messages with message.message.content array.
    // Each content block with type:'text' has a .text field with the response text.
    // Without handling this, non-streaming responses produce no output.
    // Note: routes.ts uses double-quoted strings consistently.
    expect(routesSource).toMatch(/message\.type\s*===\s*["']assistant["']/);
    // Must extract text blocks from message.message.content
    expect(routesSource).toContain("message.message.content");
  });

  it("should handle result message type to detect errors and completion", () => {
    // SDKResultMessage has type:'result' with subtype:'success' or 'error_*'.
    // The code must handle this to surface errors from the SDK result.
    // Note: routes.ts uses double-quoted strings consistently.
    expect(routesSource).toMatch(/message\.type\s*===\s*["']result["']/);
    // Must check is_error to detect execution failures
    expect(routesSource).toContain("is_error");
  });
});
