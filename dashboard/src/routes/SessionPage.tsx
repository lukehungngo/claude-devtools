import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useSessionMetrics } from "../hooks/useSessionData";
import { useEventStream } from "../hooks/useEventStream";
import { resolveProjectHashForFetch } from "../lib/repoSlug";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental, getEventsForTurn } from "../lib/turnSnapshot";
import { isAgentCompleted } from "../lib/agentStatus";
import { ConversationView } from "../components/conversation/ConversationView";
import { RawLogView } from "../components/conversation/RawLogView";
import { Menu } from "lucide-react";
import { AgentLogTab } from "../components/bottom-panel/AgentLogTab";
import { PanelModal } from "../components/PanelModal";
import { computeLiveMetrics } from "../lib/cost";
import type { SessionEvent } from "../lib/types";

/**
 * Returns true when newEvents contains an Agent tool_use dispatch AND the
 * throttle window (throttleMs) has elapsed since lastRefreshTime.
 *
 * Exported for unit testing. Used by the DAG live-refresh useEffect.
 */
export function shouldRefreshDag(
  newEvents: SessionEvent[],
  lastRefreshTime: number,
  throttleMs: number,
  now: number,
): boolean {
  if (now - lastRefreshTime < throttleMs) return false;
  return newEvents.some((e) => {
    if (e.type !== 'assistant') return false;
    const content = e.message.content;
    if (!Array.isArray(content)) return false;
    return content.some((c) => c.type === 'tool_use' && c.name === 'Agent');
  });
}

export function SessionPage() {
  const { repoSlug, sessionId } = useParams({ strict: false }) as {
    repoSlug: string;
    sessionId: string;
  };

  const ctx = useLayoutContext();
  const {
    isLive,
    registerSessionHandlers,
    setCurrentMetrics,
    setCurrentEvents,
    setCurrentLiveEvents,
    setCurrentTurns,
    setCurrentDag,
    setCurrentSelectedAgent,
    setHasSubagents,
    setCurrentSubagentMeta,
    toolFilter,
    setToolFilter,
    permissions,
    decidePermission,
    decidePermissionSession,
    questions,
    submitAnswer,
    activeSessionId,
    setActiveSessionId,
    setCurrentActiveTurnIndex,
    setSelected,
    slugMap,
    reposLoading,
    usage,
    setViewingTurnNumber,
    onClearViewingTurnRef,
    onTurnClickRef,
    turnHistoryOpen,
    setTurnHistoryOpen,
  } = ctx;

  // Resolve URL slug to projectHash for API calls. Returns null while repos
  // are still loading so useSessionMetrics holds the fetch — firing with the
  // raw URL slug would 404 (slugs are not valid projectHashes).
  const projectHash = resolveProjectHashForFetch(repoSlug, slugMap, reposLoading);

  // Sync sidebar selection with route params once we have a resolved hash
  useEffect(() => {
    if (!projectHash) return;
    setSelected({ projectHash, sessionId });
  }, [projectHash, sessionId, setSelected]);

  const { metrics, events, subagentMeta, loading: metricsLoading, refresh: refreshMetrics } = useSessionMetrics(
    projectHash,
    sessionId,
  );

  const { liveEvents, handleNewEvents } = useEventStream(
    metrics?.session?.path ?? null,
    sessionId,
  );

  // Register WS handlers on mount, deregister on unmount
  useEffect(() => {
    registerSessionHandlers({ onNewEvents: handleNewEvents });
    return () => registerSessionHandlers(null);
  }, [registerSessionHandlers, handleNewEvents]);

  // Push live events to layout context for BottomPanel
  useEffect(() => {
    setCurrentLiveEvents(liveEvents);
  }, [liveEvents, setCurrentLiveEvents]);

  useEffect(() => {
    setCurrentDag(metrics?.dag ?? null);
    setHasSubagents((metrics?.dag?.nodes?.length ?? 0) > 1);
  }, [metrics?.dag, setCurrentDag, setHasSubagents]);

  useEffect(() => {
    setCurrentSubagentMeta(subagentMeta ?? null);
  }, [subagentMeta, setCurrentSubagentMeta]);

  // SDK context window from result events — stored in ref for stable identity
  const sdkContextWindowRef = useRef<number | undefined>(undefined);
  const handleSdkContextWindow = useCallback((contextWindow: number) => {
    sdkContextWindowRef.current = contextWindow;
  }, []);

  // Cross-panel shared state (local to session)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [mainTab, setMainTab] = useState<"conversation" | "raw-log" | "agent-log">("conversation");
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Cache REST event UUIDs separately — only rebuilds when REST data changes, not on every live event
  const restKeys = useMemo(() => new Set(events.map((e) => e.uuid)), [events]);

  // Merge REST + live events, deduplicating by event UUID
  const allEvents = useMemo(() => {
    if (liveEvents.length === 0) return events;
    const uniqueLive = liveEvents.filter((e) => !restKeys.has(e.uuid));
    return uniqueLive.length > 0 ? [...events, ...uniqueLive] : events;
  }, [events, liveEvents, restKeys]);

  // Push merged events to layout context for BottomPanel
  useEffect(() => {
    setCurrentEvents(allEvents);
  }, [allEvents, setCurrentEvents]);

  // Derive live metrics from events — event-driven, no REST polling needed
  const liveMetrics = useMemo(() => {
    if (allEvents.length === 0) return null;
    return computeLiveMetrics(allEvents, isLive, sdkContextWindowRef.current);
    // sdkContextWindowRef is a ref — reads current value without adding to deps
  }, [allEvents, isLive]);

  // Overlay live values onto REST metrics so TopBar/CostTab update in real-time
  const enrichedMetrics = useMemo(() => {
    if (!metrics) return null;
    if (!liveMetrics) return metrics;
    // Override context values when SDK authoritative contextWindow is available;
    // without it, fall back to server-computed values from REST.
    const hasAuthoritativeContext = sdkContextWindowRef.current != null;
    return {
      ...metrics,
      duration: liveMetrics.duration,
      tokens: {
        ...metrics.tokens,
        inputTokens: liveMetrics.inputTokens,
        outputTokens: liveMetrics.outputTokens,
        totalCost: liveMetrics.totalCost,
      },
      ...(hasAuthoritativeContext ? {
        contextPercent: liveMetrics.contextPercent,
        contextWindowSize: liveMetrics.contextWindowSize,
      } : {}),
      models: liveMetrics.models.length > 0 ? liveMetrics.models : metrics.models,
      totalAgents: Math.max(liveMetrics.totalAgents, metrics.totalAgents),
    };
  }, [metrics, liveMetrics]);

  useEffect(() => {
    setCurrentMetrics(enrichedMetrics);
  }, [enrichedMetrics, setCurrentMetrics]);

  // Incremental turn grouping: only rebuild the last turn when events are appended
  const prevEventCountRef = useRef(0);
  const prevTurnsRef = useRef<ReturnType<typeof groupEventsIntoTurns>>([]);
  const turns = useMemo(() => {
    const prevCount = prevEventCountRef.current;
    const newEventCount = allEvents.length - prevCount;
    let result;
    if (newEventCount > 0 && prevCount > 0 && prevTurnsRef.current.length > 0) {
      result = groupEventsIntoTurnsIncremental(prevTurnsRef.current, allEvents, newEventCount, subagentMeta);
    } else {
      result = groupEventsIntoTurns(allEvents, subagentMeta);
    }
    prevEventCountRef.current = allEvents.length;
    prevTurnsRef.current = result;
    return result;
  }, [allEvents, subagentMeta]);

  // Push turns to layout context for BottomPanel
  useEffect(() => {
    setCurrentTurns(turns);
  }, [turns, setCurrentTurns]);

  // Refresh server metrics (DAG, subagentMeta, repoConfig) when the latest turn
  // completes. Completion is derived from main's events via isAgentCompleted —
  // stored turn.status was removed in the predicate refactor.
  const lastTurnCompletedRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (turns.length === 0) return;
    const lastTurn = turns[turns.length - 1];
    const lastTurnEvents = getEventsForTurn(lastTurn, allEvents);
    const lastCompleted = isAgentCompleted("main", lastTurnEvents);
    if (lastTurnCompletedRef.current === false && lastCompleted) {
      refreshMetrics();
    }
    lastTurnCompletedRef.current = lastCompleted;
  }, [turns, allEvents, refreshMetrics]);

  // Refresh DAG when a new subagent is dispatched in the live stream.
  // Uses a throttle to avoid hammering the server during rapid streaming.
  // pendingDagRefreshRef ensures Agent dispatches are not silently dropped
  // when they arrive within the throttle window.
  const lastDagRefreshTimeRef = useRef<number>(0);
  const lastScannedLiveIndexRef = useRef<number>(0);
  const pendingDagRefreshRef = useRef<boolean>(false);
  const DAG_REFRESH_THROTTLE_MS = 5000;

  useEffect(() => {
    const newEvents = liveEvents.slice(lastScannedLiveIndexRef.current);
    lastScannedLiveIndexRef.current = liveEvents.length;
    if (newEvents.length === 0) return;

    // Mark pending if any new event is an Agent dispatch
    if (newEvents.some((e) => {
      if (e.type !== 'assistant') return false;
      const content = e.message.content;
      if (!Array.isArray(content)) return false;
      return content.some((c) => c.type === 'tool_use' && c.name === 'Agent');
    })) {
      pendingDagRefreshRef.current = true;
    }

    if (!pendingDagRefreshRef.current) return;
    if (Date.now() - lastDagRefreshTimeRef.current < DAG_REFRESH_THROTTLE_MS) return;

    pendingDagRefreshRef.current = false;
    lastDagRefreshTimeRef.current = Date.now();
    refreshMetrics();
  }, [liveEvents, refreshMetrics]);

  // Default to last turn so panels show data immediately without requiring a click
  const effectiveTurnIndex = useMemo(
    () => selectedTurnIndex ?? (turns.length > 0 ? turns.length - 1 : null),
    [selectedTurnIndex, turns.length],
  );

  // Push active turn index to layout context for BottomPanel (Detail/Raw/Trace tabs)
  useEffect(() => {
    setCurrentActiveTurnIndex(effectiveTurnIndex);
  }, [effectiveTurnIndex, setCurrentActiveTurnIndex]);

  // Register callback for TopBar dismiss button to clear local selectedTurnIndex
  useEffect(() => {
    onClearViewingTurnRef.current = () => {
      setSelectedTurnIndex(null);
      setHighlightedTurnIndex(undefined);
    };
    return () => { onClearViewingTurnRef.current = null; };
  }, [onClearViewingTurnRef]);

  // Push viewing turn number to layout context for TopBar pill
  useEffect(() => {
    const turnNumber =
      selectedTurnIndex != null ? turns[selectedTurnIndex]?.turnNumber : undefined;
    setViewingTurnNumber(turnNumber);
  }, [selectedTurnIndex, turns, setViewingTurnNumber]);

  // Reset local state on session change
  useEffect(() => {
    setSelectedAgent(null);
    setHighlightedTurnIndex(undefined);
    setSelectedTurnIndex(null);
    sdkContextWindowRef.current = undefined;
    lastScannedLiveIndexRef.current = 0;
    lastDagRefreshTimeRef.current = 0;
    pendingDagRefreshRef.current = false;
  }, [repoSlug, sessionId]);

  // Sync selectedAgent to layout context for BottomPanel
  useEffect(() => {
    setCurrentSelectedAgent(selectedAgent);
  }, [selectedAgent, setCurrentSelectedAgent]);

  const handleAgentPillClick = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
  }, []);

  const handleTurnClick = useCallback((turnIndex: number) => {
    setSelectedTurnIndex(turnIndex);
    setHighlightedTurnIndex(turnIndex);
    // Scroll is handled by VirtualizedTurnList reacting to highlightedTurnIndex change
  }, []);

  // Register turn click handler for TurnHistoryPanel (rendered in AppLayout)
  useEffect(() => {
    onTurnClickRef.current = handleTurnClick;
    return () => { onTurnClickRef.current = null; };
  }, [onTurnClickRef, handleTurnClick]);

  const handleOpenPanel = useCallback((panel: string) => {
    setActivePanel(panel);
  }, []);

  const handleReopenTurnHistory = useCallback(() => {
    setTurnHistoryOpen(true);
  }, [setTurnHistoryOpen]);

  // Clean up session data on unmount
  useEffect(() => {
    return () => {
      setCurrentMetrics(null);
      setCurrentEvents([]);
      setCurrentLiveEvents([]);
      setCurrentTurns([]);
      setCurrentDag(null);
      setCurrentSelectedAgent(null);
      setCurrentActiveTurnIndex(null);
      setHasSubagents(false);
      setCurrentSubagentMeta(null);
      setViewingTurnNumber(undefined);
    };
  }, [setCurrentMetrics, setCurrentEvents, setCurrentLiveEvents, setCurrentTurns, setCurrentDag, setCurrentSelectedAgent, setCurrentActiveTurnIndex, setHasSubagents, setCurrentSubagentMeta, setViewingTurnNumber]);

  // While repos are still loading we have no projectHash yet and therefore
  // no fetch in flight — show the loading state, not the error state.
  if ((metricsLoading || !projectHash) && !metrics) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2">
        Loading session...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-full text-dt-red">
        Failed to load session
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center shrink-0 border-b border-dt-border bg-dt-bg">
        {(["conversation", "raw-log", "agent-log"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className="bg-transparent border-none cursor-pointer"
            style={{
              padding: "8px 16px",
              fontSize: 11,
              color: mainTab === tab ? "var(--acc)" : "var(--t3)",
              borderBottom: `2px solid ${mainTab === tab ? "var(--acc)" : "transparent"}`,
              transition: "all .12s",
            }}
          >
            {{ conversation: "Conversation", "raw-log": "Raw Log", "agent-log": "Agent Log" }[tab]}
          </button>
        ))}
        {(mainTab === "raw-log" || mainTab === "agent-log") && selectedTurnIndex != null && (
          <div className="ml-auto flex items-center gap-[3px] text-[10px] text-dt-text3 pr-2">
            Scoped to{" "}
            <span className="font-mono text-[10px] font-semibold text-dt-accent bg-dt-accent-bg px-[5px] py-[1px] rounded-[3px]">
              T{turns[selectedTurnIndex]?.turnNumber}
            </span>
          </div>
        )}
      </div>

      {/* Tab content */}
      {mainTab === "conversation" ? (
        <ConversationView
          events={allEvents}
          turns={turns}
          metrics={metrics}
          isLive={isLive}
          sessionCwd={metrics.session.cwd}
          sessionId={metrics.session.id}
          projectHash={projectHash ?? undefined}
          activeSessionId={activeSessionId ?? undefined}
          onSessionStarted={setActiveSessionId}
          highlightedTurnIndex={highlightedTurnIndex ?? effectiveTurnIndex ?? undefined}
          permissions={permissions}
          onPermissionDecide={decidePermission}
          onDecideSession={decidePermissionSession}
          questions={questions}
          onSubmitAnswer={submitAnswer}
          onAgentPillClick={handleAgentPillClick}
          onTurnClick={handleTurnClick}
          onOpenPanel={handleOpenPanel}
          onSdkContextWindow={handleSdkContextWindow}
        />
      ) : mainTab === "raw-log" ? (
        <RawLogView
          turns={turns}
          allEvents={allEvents}
          activeTurnIndex={effectiveTurnIndex}
        />
      ) : (
        <AgentLogTab
          allEvents={allEvents}
          dag={metrics?.dag ?? null}
          subagentMeta={subagentMeta}
          selectedAgent={selectedAgent}
          onSelectAgent={handleAgentPillClick}
          activeTurnIndex={effectiveTurnIndex}
          turns={turns}
        />
      )}
      <PanelModal
        panel={activePanel}
        onClose={() => setActivePanel(null)}
        metrics={metrics}
        usage={usage}
        projectHash={projectHash ?? undefined}
        sessionId={sessionId}
        permissions={permissions}
        onDecide={decidePermission}
      />
    </div>
  );
}
