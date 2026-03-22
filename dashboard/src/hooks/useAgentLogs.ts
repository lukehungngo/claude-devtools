import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentLogEntry } from "../lib/types";

export function useAgentLogs(
  projectHash: string | null,
  sessionId: string | null,
  agentId: string
) {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(() => {
    if (!projectHash || !sessionId) return;

    fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectHash, sessionId, agentId]);

  useEffect(() => {
    if (!projectHash || !sessionId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    fetchLogs();

    // Poll every 3 seconds for new events (reliable streaming)
    intervalRef.current = setInterval(fetchLogs, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectHash, sessionId, agentId, fetchLogs]);

  return { logs, loading };
}
