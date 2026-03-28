import { useState, useEffect, useCallback } from "react";
import type { PermissionRequest } from "../lib/types";

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);

  // Initial fetch of pending permissions
  useEffect(() => {
    fetch("/api/permissions/pending")
      .then((r) => r.json())
      .then((data: { permissions?: PermissionRequest[] }) =>
        setPermissions(data.permissions || [])
      )
      .catch(() => {});
  }, []);

  // Called by unified WS handler when permission-request arrives
  const handlePermissionRequest = useCallback(
    (permission: PermissionRequest) => {
      setPermissions((prev) => [...prev, permission]);
    },
    []
  );

  // Called by unified WS handler when permission-resolved arrives
  const handlePermissionResolved = useCallback(
    (id: string, decision: "approved" | "denied") => {
      setPermissions((prev) => {
        const updated = prev.map((p) =>
          p.id === id ? { ...p, status: decision } : p
        );
        // Cap resolved permissions to last 50 to prevent unbounded growth.
        // Keep original array order — just drop the earliest resolved entries.
        const resolved = updated.filter((p) => p.status !== "pending");
        const MAX_RESOLVED = 50;
        if (resolved.length <= MAX_RESOLVED) return updated;
        const dropSet = new Set(
          resolved.slice(0, resolved.length - MAX_RESOLVED).map((p) => p.id)
        );
        return updated.filter((p) => !dropSet.has(p.id));
      });
    },
    []
  );

  const decide = useCallback(
    async (id: string, decision: "approved" | "denied") => {
      await fetch(`/api/permissions/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setPermissions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: decision } : p))
      );
    },
    []
  );

  return {
    permissions,
    decide,
    handlePermissionRequest,
    handlePermissionResolved,
  };
}
