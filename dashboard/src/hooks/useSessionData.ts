import { useState, useEffect } from "react";
import type { SessionInfo, SessionMetrics } from "../lib/types";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { sessions, loading };
}

export function useSessionMetrics(
  projectHash: string | null,
  sessionId: string | null
) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectHash || !sessionId) return;
    setLoading(true);

    fetch(`/api/sessions/${projectHash}/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data.metrics || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectHash, sessionId]);

  return { metrics, loading };
}
