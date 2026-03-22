import { describe, it, expect } from "vitest";
import {
  addPermissionRequest,
  resolvePermissionRequest,
  getPermissionStatus,
  getPendingPermissions,
  cleanupPermissions,
} from "./permission-handler.js";

describe("permission-handler", () => {
  describe("addPermissionRequest", () => {
    it("creates a permission with status 'pending'", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Bash",
        input: { command: "ls" },
      });

      expect(perm.status).toBe("pending");
      expect(perm.sessionId).toBe("s1");
      expect(perm.agentId).toBe("main");
      expect(perm.toolName).toBe("Bash");
      expect(perm.input).toEqual({ command: "ls" });
    });

    it("assigns a UUID id", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Write",
        input: {},
      });

      expect(perm.id).toBeDefined();
      expect(typeof perm.id).toBe("string");
      expect(perm.id.length).toBeGreaterThan(0);
    });

    it("sets timestamp as ISO string", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Read",
        input: {},
      });

      expect(perm.timestamp).toBeDefined();
      // Should be valid ISO date
      expect(() => new Date(perm.timestamp)).not.toThrow();
      expect(new Date(perm.timestamp).toISOString()).toBe(perm.timestamp);
    });
  });

  describe("resolvePermissionRequest", () => {
    it("changes status to 'approved'", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Bash",
        input: {},
      });

      const resolved = resolvePermissionRequest(perm.id, "approved");

      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe("approved");
    });

    it("changes status to 'denied'", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Bash",
        input: {},
      });

      const resolved = resolvePermissionRequest(perm.id, "denied");

      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe("denied");
    });

    it("returns null for unknown ID", () => {
      const resolved = resolvePermissionRequest(
        "nonexistent-id-12345",
        "approved"
      );

      expect(resolved).toBeNull();
    });
  });

  describe("getPermissionStatus", () => {
    it("returns permission by ID", () => {
      const perm = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Edit",
        input: {},
      });

      const found = getPermissionStatus(perm.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(perm.id);
      expect(found!.toolName).toBe("Edit");
    });

    it("returns null for non-existent ID", () => {
      const found = getPermissionStatus("nonexistent-id-67890");

      expect(found).toBeNull();
    });
  });

  describe("getPendingPermissions", () => {
    it("returns only pending permissions", () => {
      const perm1 = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Bash",
        input: {},
      });
      const perm2 = addPermissionRequest({
        sessionId: "s1",
        agentId: "main",
        toolName: "Write",
        input: {},
      });
      // Resolve perm1
      resolvePermissionRequest(perm1.id, "approved");

      const pending = getPendingPermissions();

      // perm2 should be pending, perm1 should not be
      const ids = pending.map((p) => p.id);
      expect(ids).toContain(perm2.id);
      expect(ids).not.toContain(perm1.id);
    });
  });

  describe("cleanupPermissions", () => {
    it("keeps at most 50 resolved permissions", () => {
      // Add 60 permissions and resolve them all
      const perms = [];
      for (let i = 0; i < 60; i++) {
        const p = addPermissionRequest({
          sessionId: "s1",
          agentId: "main",
          toolName: `Tool${i}`,
          input: {},
        });
        resolvePermissionRequest(p.id, "approved");
        perms.push(p);
      }

      cleanupPermissions();

      // After cleanup, only 50 resolved should remain
      // Check that the oldest ones were removed
      let resolvedCount = 0;
      for (const p of perms) {
        if (getPermissionStatus(p.id) !== null) {
          resolvedCount++;
        }
      }
      // Should have removed at least 10 (60 - 50)
      expect(resolvedCount).toBeLessThanOrEqual(50);
    });
  });
});
