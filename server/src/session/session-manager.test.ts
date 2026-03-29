import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK so sendMessage doesn't need a real Claude session
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

import { SessionManager } from "./session-manager.js";
import type { PermissionMode } from "./session-manager.js";

describe("SessionManager permission mode", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults permissionMode to 'default'", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.permissionMode).toBe("default");
  });

  it("setPermissionMode changes the mode", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setPermissionMode(sessionId, "acceptEdits");
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("acceptEdits");
  });

  it("setPermissionMode returns false for unknown session", () => {
    const result = manager.setPermissionMode("nonexistent", "plan");
    expect(result).toBe(false);
  });

  it("setPermissionMode cycles through all modes", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("acceptEdits");
    manager.setPermissionMode(sessionId, "plan");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("plan");
    manager.setPermissionMode(sessionId, "default");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("default");
  });
});

describe("SessionManager permission mode auto-approve behavior", () => {
  let manager: SessionManager;
  beforeEach(() => {
    manager = new SessionManager(vi.fn() as (data: unknown) => void);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("in acceptEdits mode, auto-approves Edit/Write/Read tools", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");
    const session = manager.getStatus(sessionId)!;

    // Use the public shouldAutoResolve method to test permission logic
    for (const tool of ["Edit", "Write", "Read"]) {
      const result = manager.shouldAutoResolve(sessionId, tool);
      expect(result).toEqual({ behavior: "allow" });
    }
  });

  it("in acceptEdits mode, does NOT auto-approve Bash/Agent", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");

    for (const tool of ["Bash", "Agent"]) {
      const result = manager.shouldAutoResolve(sessionId, tool);
      expect(result).toBeNull();
    }
  });

  it("in plan mode, auto-allows Read/Glob/Grep", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "plan");

    for (const tool of ["Read", "Glob", "Grep"]) {
      const result = manager.shouldAutoResolve(sessionId, tool);
      expect(result).toEqual({ behavior: "allow" });
    }
  });

  it("in plan mode, auto-denies Edit/Write/Bash", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "plan");

    for (const tool of ["Edit", "Write", "Bash"]) {
      const result = manager.shouldAutoResolve(sessionId, tool);
      expect(result).toEqual({ behavior: "deny", message: "Blocked by plan mode" });
    }
  });

  it("in default mode, returns null (prompt user)", async () => {
    const sessionId = await manager.startSession("/tmp");

    for (const tool of ["Edit", "Write", "Bash", "Read"]) {
      const result = manager.shouldAutoResolve(sessionId, tool);
      expect(result).toBeNull();
    }
  });
});

describe("SessionManager fastMode", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults fastMode to false", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.fastMode).toBe(false);
  });

  it("setFastMode toggles fastMode on", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setFastMode(sessionId, true);
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.fastMode).toBe(true);
  });

  it("setFastMode toggles fastMode off", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setFastMode(sessionId, true);
    manager.setFastMode(sessionId, false);
    expect(manager.getStatus(sessionId)?.fastMode).toBe(false);
  });

  it("setFastMode returns false for unknown session", () => {
    const result = manager.setFastMode("nonexistent", true);
    expect(result).toBe(false);
  });
});

describe("SessionManager effortLevel", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults effortLevel to undefined", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.effortLevel).toBeUndefined();
  });

  it("setEffortLevel sets level to low", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setEffortLevel(sessionId, "low");
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("low");
  });

  it("setEffortLevel sets level to medium", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "medium");
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("medium");
  });

  it("setEffortLevel sets level to high", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "high");
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("high");
  });

  it("setEffortLevel returns false for unknown session", () => {
    const result = manager.setEffortLevel("nonexistent", "low");
    expect(result).toBe(false);
  });
});

describe("SessionManager.sendMessage passes effortLevel to SDK query()", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("passes effort option to query() when effortLevel is set", async () => {
    // Create an async generator that yields nothing (empty stream)
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "low");

    // Consume the async generator
    const gen = manager.sendMessage(sessionId, "hello");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.effort).toBe("low");
  });

  it("does not pass effort option when effortLevel is undefined", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    // effortLevel is undefined by default

    const gen = manager.sendMessage(sessionId, "hello");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.effort).toBeUndefined();
  });
});
