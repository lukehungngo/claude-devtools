import { useState, useEffect, useRef } from "react";
import type { AgentLogEntry } from "../lib/types";
import { isSyntheticAgentId } from "../lib/agentIds";

/**
 * Load an agent's log, kept live by refetching when new events arrive.
 *
 * Correctness guarantees:
 *  - **No stale-response race:** each fetch carries an AbortController + a
 *    `cancelled` guard, so a slow response for a previously-selected agent can
 *    never overwrite the currently-selected agent's log.
 *  - **No mount double-fetch:** the live-refetch only fires when `liveEventCount`
 *    strictly INCREASES (it is the always-positive total event count, not a
 *    delta, so without this guard it fired once on mount on top of the primary
 *    fetch).
 *  - Empty / synthetic agentIds short-circuit (no wasted `/events/` round-trip).
 */
export function useAgentLogs(
  projectHash: string | null,
  sessionId: string | null,
  agentId: string,
  liveEventCount?: number,
) {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const canFetch = !!projectHash && !!sessionId && !!agentId && !isSyntheticAgentId(agentId);

  // Primary fetch — on selection change.
  useEffect(() => {
    if (!canFetch) {
      setLogs([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { events?: AgentLogEntry[] }) => {
        if (!cancelled) {
          setLogs(data.events || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && (err as { name?: string })?.name !== "AbortError") setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectHash, sessionId, agentId, canFetch]);

  // Live refetch — only when liveEventCount strictly increases (new events),
  // never on mount. Same abort/cancelled guard against stale overwrites.
  const prevLiveRef = useRef(liveEventCount ?? 0);
  useEffect(() => {
    const prev = prevLiveRef.current;
    const current = liveEventCount ?? 0;
    prevLiveRef.current = current;
    if (!canFetch || current <= prev) return;

    const controller = new AbortController();
    let cancelled = false;
    fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { events?: AgentLogEntry[] }) => {
        if (!cancelled) setLogs(data.events || []);
      })
      .catch(() => {
        /* abort or transient error — keep the last good logs */
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [liveEventCount, projectHash, sessionId, agentId, canFetch]);

  return { logs, loading };
}
