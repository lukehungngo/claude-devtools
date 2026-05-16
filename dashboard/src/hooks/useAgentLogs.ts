import { useState, useEffect, useCallback } from "react";
import type { AgentLogEntry } from "../lib/types";
import { isSyntheticAgentId } from "../lib/agentIds";

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
    // Phase 3: synthetic agents have no own events — short-circuit before fetching
    // to avoid a server round-trip that would return [] anyway.
    if (isSyntheticAgentId(agentId)) {
      setLogs([]);
      setLoading(false);
      return;
    }

    fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
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
  }, [liveEventCount, fetchLogs]);

  return { logs, loading };
}
