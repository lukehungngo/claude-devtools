import type { PermissionRequest } from "../types.js";
export declare function addSessionAllowance(sessionId: string, toolName: string): void;
export declare function isToolAllowedForSession(sessionId: string, toolName: string): boolean;
export declare function getSessionAllowances(sessionId: string): string[];
export declare function clearSessionAllowances(): void;
export declare function addPermissionRequest(data: {
    sessionId: string;
    agentId: string;
    toolName: string;
    input: Record<string, unknown>;
}): PermissionRequest;
export declare function resolvePermissionRequest(id: string, decision: "approved" | "denied"): PermissionRequest | null;
export declare function getPermissionStatus(id: string): PermissionRequest | null;
export declare function getPendingPermissions(): PermissionRequest[];
export declare function cleanupPermissions(): void;
