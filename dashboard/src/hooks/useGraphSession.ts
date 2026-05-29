import { useContext, useEffect, useMemo, useRef } from "react";
import type { SessionEvent, AgentDAG } from "../lib/types";
import type { TurnSnapshot } from "../lib/turnSnapshot";
import { useSessionMetrics } from "./useSessionData";
import { groupEventsIntoTurns } from "../lib/turnSnapshot";
import { filterDagForTurn } from "../lib/filterDagForTurn";
import { LayoutContext } from "../contexts/LayoutContext";

/** Debounce window before refreshing on new live events (Invariant #8). */
const REFRESH_DEBOUNCE_MS = 1500;

export interface GraphSessionState {
  dagForTurn: AgentDAG | null;
  runningAgentIds: Set<string>;
  lastTurn: TurnSnapshot | null;
  events: SessionEvent[];
  liveEventCount: number;
  loading: boolean;
}

/**
 * Load a session's metrics + events, derive the most recent turn's filtered
 * agent DAG, and keep it live by registering a debounced WS refresh for the
 * selected session. Reuses the authoritative server `status` (no client
 * re-derivation — avoids the status-flash gotcha).
 */
export function useGraphSession(
  projectHash: string | null,
  sessionId: string | null,
): GraphSessionState {
  const layout = useContext(LayoutContext);
  const { metrics, events, subagentMeta, loading, refresh } = useSessionMetrics(
    projectHash,
    sessionId,
  );

  const turns = useMemo(
    () => groupEventsIntoTurns(events, subagentMeta),
    [events, subagentMeta],
  );

  const lastTurn = useMemo<TurnSnapshot | null>(
    () => (turns.length > 0 ? turns[turns.length - 1] : null),
    [turns],
  );

  const dagForTurn = useMemo<AgentDAG | null>(
    () => filterDagForTurn(metrics?.dag ?? null, lastTurn ?? undefined),
    [metrics?.dag, lastTurn],
  );

  const runningAgentIds = useMemo<Set<string>>(
    () => new Set((dagForTurn?.nodes ?? []).filter((n) => n.status === "active").map((n) => n.id)),
    [dagForTurn],
  );

  // ── Live: debounced refresh on new events for the selected session ──
  // Keep the selected sessionId + refresh fn in refs so the WS handler is
  // stable and never reads stale closures (Invariant #8).
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
    dagForTurn,
    runningAgentIds,
    lastTurn,
    events,
    liveEventCount: events.length,
    loading,
  };
}
