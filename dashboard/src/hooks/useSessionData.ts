import { useState, useEffect, useCallback, useRef } from "react";
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
  const prevSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectHash || !sessionId) {
      setMetrics(null);
      setEvents([]);
      setSubagentMeta({});
      prevSessionKeyRef.current = null;
      return;
    }

    const sessionKey = `${projectHash}/${sessionId}`;
    const isNewSession = prevSessionKeyRef.current !== sessionKey;
    prevSessionKeyRef.current = sessionKey;

    if (isNewSession) {
      setMetrics(null);
      setEvents([]);
      setSubagentMeta({});
    }
    setLoading(true);

    const controller = new AbortController();

    fetch(`/api/sessions/${projectHash}/${sessionId}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setMetrics(data.metrics || null);
        setEvents(data.events || []);
        setSubagentMeta(data.subagentMeta || {});
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMetrics(null);
        setEvents([]);
        setSubagentMeta({});
        setLoading(false);
      });

    return () => controller.abort();
  }, [projectHash, sessionId, refreshCount]);

  const refresh = useCallback(() => {
    if (projectHash && sessionId) {
      setRefreshCount((c) => c + 1);
    }
  }, [projectHash, sessionId]);

  return { metrics, events, subagentMeta, loading, refresh };
}
