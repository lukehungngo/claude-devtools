import { useState, useEffect, useCallback } from "react";
import type { AgentLogEntry } from "../lib/types";

export function useAgentLogs(
  projectHash: string | null,
  sessionId: string | null,
  agentId: string,
  liveEventCount?: number
) {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(() => {
    if (!projectHash || !sessionId) return;

    fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`)
      .then((r) => r.json())
      .then((data: { events?: AgentLogEntry[] }) => {
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
  }, [projectHash, sessionId, agentId, fetchLogs]);

  // Refetch when live events arrive (replaces 3s polling)
  useEffect(() => {
    if (liveEventCount && liveEventCount > 0 && projectHash && sessionId) {
      fetchLogs();
    }
  }, [liveEventCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return { logs, loading };
}
