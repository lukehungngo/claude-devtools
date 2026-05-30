import { useContext, useEffect, useMemo, useRef } from "react";
import type { SessionEvent, AgentDAG, WorkflowSummary } from "../lib/types";
import { useSessionMetrics } from "./useSessionData";
import { LayoutContext } from "../contexts/LayoutContext";

/** Debounce window before refreshing on new live events (Invariant #8). */
const REFRESH_DEBOUNCE_MS = 1500;

export interface GraphSessionState {
  /** The session's FULL agent graph — every agent the session spawned across
   *  all turns (not scoped to one turn). */
  dag: AgentDAG | null;
  /** Orchestrated multi-agent workflows in this session (empty when none). */
  workflows: WorkflowSummary[];
  runningAgentIds: Set<string>;
  events: SessionEvent[];
  liveEventCount: number;
  loading: boolean;
}

/**
 * Load a session's metrics + events and expose its FULL agent DAG (every agent
 * the session spawned), kept live by a debounced WS refresh for the selected
 * session. Reuses the authoritative server `status` (no client re-derivation —
 * avoids the status-flash gotcha).
 *
 * Note: this intentionally shows the WHOLE session, not just the most recent
 * turn — a session spans many agents across turns and the graph must surface
 * all of them.
 */
export function useGraphSession(
  projectHash: string | null,
  sessionId: string | null,
): GraphSessionState {
  const layout = useContext(LayoutContext);
  const { metrics, events, loading, refresh } = useSessionMetrics(projectHash, sessionId);

  const dag = useMemo<AgentDAG | null>(() => metrics?.dag ?? null, [metrics?.dag]);

  const workflows = useMemo<WorkflowSummary[]>(() => metrics?.workflows ?? [], [metrics?.workflows]);

  const runningAgentIds = useMemo<Set<string>>(
    () => new Set((dag?.nodes ?? []).filter((n) => n.status === "active").map((n) => n.id)),
    [dag],
  );

  // ── Live: debounced refresh on new events for the selected session ──
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerSessionHandlers = layout?.registerSessionHandlers;

  useEffect(() => {
    if (!registerSessionHandlers || !sessionId) {
      return;
    }
    registerSessionHandlers({
      onNewEvents: (incomingSessionId) => {
        if (incomingSessionId !== sessionIdRef.current) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          refreshRef.current();
        }, REFRESH_DEBOUNCE_MS);
      },
    });
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      registerSessionHandlers(null);
    };
  }, [registerSessionHandlers, sessionId]);

  return {
    dag,
    workflows,
    runningAgentIds,
    events,
    liveEventCount: events.length,
    loading,
  };
}
