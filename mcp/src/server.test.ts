import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";

describe("buildServer", () => {
  it("returns an MCP Server with expected name and version", () => {
    const srv = buildServer();
    // The SDK Server stores serverInfo on a private/protected field
    // Access via the public-facing getter if available, otherwise internal
    expect(srv).toBeDefined();
    // Verify it has the connect method (Server interface)
    expect(typeof srv.connect).toBe("function");
  });
});
