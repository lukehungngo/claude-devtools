import { useState, useEffect, useCallback } from "react";
import type { SessionMetrics, SessionEvent, SubagentMeta } from "../lib/types";

export function useSessionMetrics(
  projectHash: string | null,
  sessionId: string | null
) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [subagentMeta, setSubagentMeta] = useState<SubagentMeta>({});
  const [loading, setLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!projectHash || !sessionId) {
      setMetrics(null);
      setEvents([]);
      setSubagentMeta({});
      return;
    }
    setLoading(true);

    fetch(`/api/sessions/${projectHash}/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data.metrics || null);
        setEvents(data.events || []);
        setSubagentMeta(data.subagentMeta || {});
        setLoading(false);
      })
      .catch(() => {
        setMetrics(null);
        setEvents([]);
        setSubagentMeta({});
        setLoading(false);
      });
  }, [projectHash, sessionId, refreshCount]);

  const refresh = useCallback(() => {
    if (projectHash && sessionId) {
      setRefreshCount((c) => c + 1);
    }
  }, [projectHash, sessionId]);

  return { metrics, events, subagentMeta, loading, refresh };
}
