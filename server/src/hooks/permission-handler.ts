import { randomUUID } from "node:crypto";
import type { PermissionRequest } from "../types.js";
import { permissionLog } from "../logger.js";

const pendingPermissions = new Map<string, PermissionRequest>();

// Session-scoped tool allowances: Map<sessionId, Set<toolName>>
// When a user clicks "Allow for session", the tool is added here.
// Future permission requests for the same tool+session are auto-approved.
const sessionAllowances = new Map<string, Set<string>>();

export function addSessionAllowance(sessionId: string, toolName: string): void {
  let tools = sessionAllowances.get(sessionId);
  if (!tools) {
    tools = new Set();
    sessionAllowances.set(sessionId, tools);
  }
  tools.add(toolName);
  permissionLog.info({ sessionId, toolName }, "session allowance added");
}

export function isToolAllowedForSession(sessionId: string, toolName: string): boolean {
  return sessionAllowances.get(sessionId)?.has(toolName) ?? false;
}

export function clearSessionAllowances(): void {
  sessionAllowances.clear();
}

export function addPermissionRequest(data: {
  sessionId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
}): PermissionRequest {
  // Check if tool is already allowed for this session
  const autoApproved = isToolAllowedForSession(data.sessionId, data.toolName);

  const permission: PermissionRequest = {
    id: randomUUID(),
    sessionId: data.sessionId,
    agentId: data.agentId,
    toolName: data.toolName,
    input: data.input,
    timestamp: new Date().toISOString(),
    status: autoApproved ? "approved" : "pending",
  };

  pendingPermissions.set(permission.id, permission);
  permissionLog.info(
    { id: permission.id, toolName: data.toolName, sessionId: data.sessionId, autoApproved },
    autoApproved ? "permission auto-approved (session allowance)" : "permission requested",
  );
  return permission;
}

export function resolvePermissionRequest(
  id: string,
  decision: "approved" | "denied"
): PermissionRequest | null {
  const permission = pendingPermissions.get(id);
  if (!permission) return null;

  permission.status = decision;
  permissionLog.info({ id, decision, toolName: permission.toolName }, "permission resolved");
  // Purge old resolved permissions to prevent memory leak
  cleanupPermissions();
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
