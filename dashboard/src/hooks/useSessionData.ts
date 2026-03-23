import { useState, useEffect } from "react";
import type { SessionInfo, SessionMetrics, SessionEvent, SubagentMeta } from "../lib/types";

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
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [subagentMeta, setSubagentMeta] = useState<SubagentMeta>({});
  const [loading, setLoading] = useState(false);

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
  }, [projectHash, sessionId]);

  return { metrics, events, subagentMeta, loading };
}
