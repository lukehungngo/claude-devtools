import { randomUUID } from "node:crypto";
import type { PermissionRequest } from "../types.js";

const pendingPermissions = new Map<string, PermissionRequest>();

export function addPermissionRequest(data: {
  sessionId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
}): PermissionRequest {
  const permission: PermissionRequest = {
    id: randomUUID(),
    sessionId: data.sessionId,
    agentId: data.agentId,
    toolName: data.toolName,
    input: data.input,
    timestamp: new Date().toISOString(),
    status: "pending",
  };

  pendingPermissions.set(permission.id, permission);
  return permission;
}

export function resolvePermissionRequest(
  id: string,
  decision: "approved" | "denied"
): PermissionRequest | null {
  const permission = pendingPermissions.get(id);
  if (!permission) return null;

  permission.status = decision;
  return permission;
}

export function getPermissionStatus(
  id: string
): PermissionRequest | null {
  return pendingPermissions.get(id) || null;
}

export function getPendingPermissions(): PermissionRequest[] {
  return Array.from(pendingPermissions.values()).filter(
    (p) => p.status === "pending"
  );
}

// Clean up old resolved permissions (keep last 50)
export function cleanupPermissions(): void {
  const all = Array.from(pendingPermissions.entries());
  const resolved = all.filter(([, p]) => p.status !== "pending");
  if (resolved.length > 50) {
    const toRemove = resolved
      .sort(
        (a, b) =>
          new Date(a[1].timestamp).getTime() -
          new Date(b[1].timestamp).getTime()
      )
      .slice(0, resolved.length - 50);
    for (const [id] of toRemove) {
      pendingPermissions.delete(id);
    }
  }
}
