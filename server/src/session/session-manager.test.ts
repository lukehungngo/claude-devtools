import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK so sendMessage doesn't need a real Claude session
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
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
