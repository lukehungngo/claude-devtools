import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  afterEach(() => {
    manager.dispose();
  });

  describe("startSession", () => {
    it("creates a session and returns a sessionId", async () => {
      const id = await manager.startSession("/tmp");
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      const status = manager.getStatus(id);
      expect(status).toBeDefined();
      expect(status!.cwd).toBe("/tmp");
      expect(status!.status).toBe("idle");
    });

    it("creates unique session IDs", async () => {
      const id1 = await manager.startSession("/tmp");
      const id2 = await manager.startSession("/tmp");
      expect(id1).not.toBe(id2);
    });
  });

  describe("getActiveSessions", () => {
    it("returns empty array initially", () => {
      expect(manager.getActiveSessions()).toEqual([]);
    });

    it("returns all active sessions", async () => {
      await manager.startSession("/tmp");
      await manager.startSession("/tmp");
      expect(manager.getActiveSessions()).toHaveLength(2);
    });
  });

  describe("abortSession", () => {
    it("returns false for unknown session", () => {
      expect(manager.abortSession("nonexistent")).toBe(false);
    });

    it("aborts an active session", async () => {
      const id = await manager.startSession("/tmp");
      expect(manager.abortSession(id)).toBe(true);
      expect(manager.getStatus(id)!.status).toBe("idle");
    });
  });

  describe("removeSession", () => {
    it("removes a session from tracking", async () => {
      const id = await manager.startSession("/tmp");
      expect(manager.removeSession(id)).toBe(true);
      expect(manager.getStatus(id)).toBeUndefined();
    });

    it("returns false for unknown session", () => {
      expect(manager.removeSession("nonexistent")).toBe(false);
    });
  });

  describe("getPendingQuestions", () => {
    it("returns empty array when no questions pending", () => {
      expect(manager.getPendingQuestions()).toEqual([]);
    });

    it("returns pending questions across sessions", async () => {
      const id1 = await manager.startSession("/tmp");
      const id2 = await manager.startSession("/tmp");
      const s1 = manager.getStatus(id1)!;
      const s2 = manager.getStatus(id2)!;

      s1.questionResolvers.set("q1", () => {});
      s2.questionResolvers.set("q2", () => {});

      const pending = manager.getPendingQuestions();
      expect(pending).toHaveLength(2);
      expect(pending).toContainEqual({ questionId: "q1", sessionId: id1 });
      expect(pending).toContainEqual({ questionId: "q2", sessionId: id2 });
    });
  });

  describe("model selection", () => {
    it("model is undefined by default", async () => {
      const id = await manager.startSession("/tmp");
      const session = manager.getStatus(id)!;
      expect(session.model).toBeUndefined();
    });

    it("setModel stores model on the session", async () => {
      const id = await manager.startSession("/tmp");
      const result = manager.setModel(id, "claude-opus-4-6");
      expect(result).toBe(true);
      expect(manager.getStatus(id)!.model).toBe("claude-opus-4-6");
    });

    it("setModel returns false for unknown session", () => {
      expect(manager.setModel("nonexistent", "claude-opus-4-6")).toBe(false);
    });

    it("setModel can change model to a different value", async () => {
      const id = await manager.startSession("/tmp");
      manager.setModel(id, "claude-opus-4-6");
      manager.setModel(id, "claude-sonnet-4-6");
      expect(manager.getStatus(id)!.model).toBe("claude-sonnet-4-6");
    });

    it("setModel can clear model by setting undefined", async () => {
      const id = await manager.startSession("/tmp");
      manager.setModel(id, "claude-opus-4-6");
      manager.setModel(id, undefined);
      expect(manager.getStatus(id)!.model).toBeUndefined();
    });
  });

  describe("resumeSession", () => {
    it("throws when cwd does not exist", async () => {
      const nonExistentPath = `/non-existent-path-${Date.now()}`;
      await expect(manager.resumeSession("some-id", nonExistentPath))
        .rejects.toThrow("does not exist");
    });
  });

  describe("dispose", () => {
    it("stops the GC timer", () => {
      manager.dispose();
      // No assertions needed — just verifying it doesn't throw
    });
  });

  describe("resolveQuestion", () => {
    it("returns false when no matching resolver exists", async () => {
      expect(manager.resolveQuestion("nonexistent", "answer")).toBe(false);
    });

    it("calls the resolver with the answer", async () => {
      const id = await manager.startSession("/tmp");
      const session = manager.getStatus(id)!;

      let receivedAnswer: string | null = null;
      session.questionResolvers.set("q-1", (answer) => { receivedAnswer = answer; });
      session.status = "waiting-permission";

      expect(manager.resolveQuestion("q-1", "my answer")).toBe(true);
      expect(receivedAnswer).toBe("my answer");
    });

    it("restores status from waiting-permission to streaming after resolving", async () => {
      const id = await manager.startSession("/tmp");
      const session = manager.getStatus(id)!;

      session.questionResolvers.set("q-2", () => {});
      session.status = "waiting-permission";

      manager.resolveQuestion("q-2", "answer");
      // Bug: status stays at "waiting-permission" without the fix
      expect(session.status).toBe("streaming");
    });

    it("broadcasts status running after resolving question", async () => {
      const id = await manager.startSession("/tmp");
      const session = manager.getStatus(id)!;

      broadcast.calls.length = 0; // reset
      session.questionResolvers.set("q-3", () => {});
      session.status = "waiting-permission";

      manager.resolveQuestion("q-3", "answer");

      const statusBroadcasts = broadcast.calls.filter(
        (c) => (c as Record<string, unknown>).type === "status"
      );
      expect(statusBroadcasts).toHaveLength(1);
      expect((statusBroadcasts[0] as Record<string, unknown>).status).toBe("streaming");
    });

    it("removes the resolver after resolving", async () => {
      const id = await manager.startSession("/tmp");
      const session = manager.getStatus(id)!;

      session.questionResolvers.set("q-4", () => {});
      manager.resolveQuestion("q-4", "answer");

      expect(session.questionResolvers.has("q-4")).toBe(false);
    });
  });

  describe("resolvePermission", () => {
    it("returns false when no matching resolver exists", () => {
      expect(manager.resolvePermission("nonexistent", "approved")).toBe(false);
    });

    it("resolves a pending permission with approve", async () => {
      const id = await manager.startSession("/tmp");
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
      const id = await manager.startSession("/tmp");
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
