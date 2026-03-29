import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK
const mockQuery = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock("../logger.js", () => ({
  sessionLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SessionManager } from "../session/session-manager.js";

describe("SessionManager: rich permission fields forwarded via canUseTool", () => {
  let manager: SessionManager;
  let broadcastFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcastFn = vi.fn();
    manager = new SessionManager(broadcastFn as (data: unknown) => void);
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("forwards title, displayName, description from canUseTool options to broadcast", async () => {
    // Make the query call canUseTool with rich options
    mockQuery.mockImplementation(({ options }: { options: { canUseTool: Function } }) => {
      // Simulate SDK calling canUseTool with rich options
      const canUseTool = options.canUseTool;

      async function* stream() {
        // Call canUseTool and let it broadcast, then resolve externally
        const permPromise = canUseTool("Read", { file_path: "/src/index.ts" }, {
          signal: new AbortController().signal,
          title: "Read file /src/index.ts",
          displayName: "Read file",
          description: "The agent wants to read this file to understand the import structure",
          toolUseID: "tool-use-123",
          agentID: "agent-abc",
          suggestions: [{ type: "addRules", rules: [{ toolName: "Read" }], behavior: "allow", destination: "session" }],
        });

        // Resolve the permission (simulating user clicking approve)
        // We need to wait for the broadcast to happen first
        await new Promise(resolve => setTimeout(resolve, 10));

        // Find the permission ID from the broadcast and resolve it
        const broadcastCall = broadcastFn.mock.calls.find(
          (call: unknown[]) => (call[0] as { type: string }).type === "permission-request"
        );
        if (broadcastCall) {
          const permId = (broadcastCall[0] as { permission: { id: string } }).permission.id;
          manager.resolvePermission(permId, "approved");
        }

        await permPromise;
        yield { type: "result" };
      }

      return stream();
    });

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of gen) {
      // drain
    }

    // Find the permission-request broadcast
    const permBroadcast = broadcastFn.mock.calls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === "permission-request"
    );
    expect(permBroadcast).toBeTruthy();

    const permission = (permBroadcast![0] as { permission: Record<string, unknown> }).permission;
    expect(permission.title).toBe("Read file /src/index.ts");
    expect(permission.displayName).toBe("Read file");
    expect(permission.description).toBe("The agent wants to read this file to understand the import structure");
    expect(permission.toolUseId).toBe("tool-use-123");
    expect(permission.agentId).toBe("agent-abc");
    expect(permission.suggestions).toEqual([
      { type: "addRules", rules: [{ toolName: "Read" }], behavior: "allow", destination: "session" }
    ]);
  });

  it("omits rich fields from broadcast when canUseTool options lack them", async () => {
    mockQuery.mockImplementation(({ options }: { options: { canUseTool: Function } }) => {
      const canUseTool = options.canUseTool;

      async function* stream() {
        const permPromise = canUseTool("Bash", { command: "ls" }, {
          signal: new AbortController().signal,
          toolUseID: "tool-use-456",
          // No title, displayName, description, suggestions, agentID
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        const broadcastCall = broadcastFn.mock.calls.find(
          (call: unknown[]) => (call[0] as { type: string }).type === "permission-request"
        );
        if (broadcastCall) {
          const permId = (broadcastCall[0] as { permission: { id: string } }).permission.id;
          manager.resolvePermission(permId, "approved");
        }

        await permPromise;
        yield { type: "result" };
      }

      return stream();
    });

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of gen) {
      // drain
    }

    const permBroadcast = broadcastFn.mock.calls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === "permission-request"
    );
    expect(permBroadcast).toBeTruthy();

    const permission = (permBroadcast![0] as { permission: Record<string, unknown> }).permission;
    // Should NOT have these fields when not provided
    expect(permission.title).toBeUndefined();
    expect(permission.displayName).toBeUndefined();
    expect(permission.description).toBeUndefined();
    expect(permission.suggestions).toBeUndefined();
    // agentId defaults to "main" when agentID is not provided
    expect(permission.agentId).toBe("main");
    // toolUseId should be present since it was provided
    expect(permission.toolUseId).toBe("tool-use-456");
  });
});
