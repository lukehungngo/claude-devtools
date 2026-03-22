import { useState, useEffect, useCallback } from "react";
import type { PermissionRequest } from "../lib/types";

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    fetch("/api/permissions/pending")
      .then((r) => r.json())
      .then((data) => setPermissions(data.permissions || []))
      .catch(() => {});
  }, []);

  // Listen for WebSocket permission events
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "permission-request") {
          setPermissions((prev) => [...prev, data.permission]);
        } else if (data.type === "permission-resolved") {
          setPermissions((prev) =>
            prev.map((p) =>
              p.id === data.id ? { ...p, status: data.decision } : p
            )
          );
        }
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, []);

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

  return { permissions, decide };
}
