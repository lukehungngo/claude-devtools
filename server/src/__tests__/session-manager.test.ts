import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../session/session-manager.js";

// We test the non-SDK parts of SessionManager
describe("SessionManager", () => {
  let manager: SessionManager;
  const makeBroadcast = () => {
    const calls: unknown[] = [];
    const fn = (data: unknown): void => { calls.push(data); };
    return { fn, calls };
  };
  let broadcast: ReturnType<typeof makeBroadcast>;

  beforeEach(() => {
    broadcast = makeBroadcast();
    manager = new SessionManager(broadcast.fn);
  });

  describe("startSession", () => {
    it("creates a session and returns a sessionId", async () => {
      const id = await manager.startSession("/tmp/test");
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      const status = manager.getStatus(id);
      expect(status).toBeDefined();
      expect(status!.cwd).toBe("/tmp/test");
      expect(status!.status).toBe("idle");
    });

    it("creates unique session IDs", async () => {
      const id1 = await manager.startSession("/tmp/a");
      const id2 = await manager.startSession("/tmp/b");
      expect(id1).not.toBe(id2);
    });
  });

  describe("getActiveSessions", () => {
    it("returns empty array initially", () => {
      expect(manager.getActiveSessions()).toEqual([]);
    });

    it("returns all active sessions", async () => {
      await manager.startSession("/tmp/a");
      await manager.startSession("/tmp/b");
      expect(manager.getActiveSessions()).toHaveLength(2);
    });
  });

  describe("abortSession", () => {
    it("returns false for unknown session", () => {
      expect(manager.abortSession("nonexistent")).toBe(false);
    });

    it("aborts an active session", async () => {
      const id = await manager.startSession("/tmp/test");
      expect(manager.abortSession(id)).toBe(true);
      expect(manager.getStatus(id)!.status).toBe("idle");
    });
  });

  describe("removeSession", () => {
    it("removes a session from tracking", async () => {
      const id = await manager.startSession("/tmp/test");
      expect(manager.removeSession(id)).toBe(true);
      expect(manager.getStatus(id)).toBeUndefined();
    });

    it("returns false for unknown session", () => {
      expect(manager.removeSession("nonexistent")).toBe(false);
    });
  });

  describe("resolvePermission", () => {
    it("returns false when no matching resolver exists", () => {
      expect(manager.resolvePermission("nonexistent", "approved")).toBe(false);
    });

    it("resolves a pending permission with approve", async () => {
      const id = await manager.startSession("/tmp/test");
      const session = manager.getStatus(id)!;

      // Simulate a pending permission resolver
      let resolved = false;
      let resolvedResult: unknown = null;
      session.permissionResolvers.set("perm-1", (result) => {
        resolved = true;
        resolvedResult = result;
      });
      session.status = "waiting-permission";

      expect(manager.resolvePermission("perm-1", "approved")).toBe(true);
      expect(resolved).toBe(true);
      expect(resolvedResult).toEqual({ behavior: "allow" });
    });

    it("resolves deny with message", async () => {
      const id = await manager.startSession("/tmp/test");
      const session = manager.getStatus(id)!;

      let resolvedResult: unknown = null;
      session.permissionResolvers.set("perm-2", (result) => {
        resolvedResult = result;
      });
      session.status = "waiting-permission";

      manager.resolvePermission("perm-2", "denied");
      expect(resolvedResult).toEqual({ behavior: "deny", message: "User denied permission" });
    });
  });
});
