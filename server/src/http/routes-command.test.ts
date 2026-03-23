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

  it("should use res.on(close) not req.on(close) for abort detection", () => {
    // req.on("close") fires when the POST body is fully received — too early.
    // The SSE response is still streaming when req fires close, which immediately
    // aborts the AbortController and kills the SDK subprocess with "Operation aborted".
    // res.on("close") fires when the client disconnects from the SSE response stream,
    // which is the correct signal to abort.
    expect(routesSource).toContain('res.on("close"');
    // Must not use req.on("close") as the abort trigger (only allowed in comments)
    const nonCommentLines = routesSource.split('\n').filter(l => !l.trimStart().startsWith('//'));
    expect(nonCommentLines.join('\n')).not.toMatch(/req\.on\(["']close["']/);
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
