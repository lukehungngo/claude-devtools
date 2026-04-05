import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useSessionMetrics } from "../hooks/useSessionData";
import { useEventStream } from "../hooks/useEventStream";
import { resolveSlugToProjectHash } from "../lib/repoSlug";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental } from "../lib/turnSnapshot";
import { ConversationView } from "../components/conversation/ConversationView";
import { ReopenBar } from "../components/conversation/ReopenBar";
import { RawLogView } from "../components/conversation/RawLogView";

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
    usage,
    setViewingTurnNumber,
    onClearViewingTurnRef,
    onTurnClickRef,
    turnHistoryOpen,
    setTurnHistoryOpen,
  } = ctx;

  // Resolve URL slug to projectHash for API calls
  const projectHash = resolveSlugToProjectHash(repoSlug, slugMap) ?? repoSlug;

  // Sync sidebar selection with route params
  useEffect(() => {
    setSelected({ projectHash, sessionId });
  }, [projectHash, sessionId, setSelected]);

  const { metrics, events, subagentMeta, loading: metricsLoading, refresh: refreshMetrics } = useSessionMetrics(
    projectHash,
    sessionId,
  );

  const { liveEvents, handleNewEvents, clearLiveEvents } = useEventStream(
    metrics?.session?.path ?? null,
    sessionId,
  );

  // Register WS handlers on mount, deregister on unmount
  useEffect(() => {
    registerSessionHandlers({ onNewEvents: handleNewEvents });
    return () => registerSessionHandlers(null);
  }, [registerSessionHandlers, handleNewEvents]);

  // Push metrics to layout context for TopBar
  useEffect(() => {
    setCurrentMetrics(metrics);
  }, [metrics, setCurrentMetrics]);

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

  // Cross-panel shared state (local to session)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [mainTab, setMainTab] = useState<"conversation" | "raw-log">("conversation");

  // Background REST sync every 30 seconds (replaces per-event debounced refetch)
  // Use ref for liveEvents length to avoid interval teardown on every event batch
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshEventCountRef = useRef(0);
  const liveEventsLengthRef = useRef(0);
  liveEventsLengthRef.current = liveEvents.length;
  useEffect(() => {
    if (!projectHash || !sessionId) return;
    syncIntervalRef.current = setInterval(() => {
      if (liveEventsLengthRef.current > lastRefreshEventCountRef.current) {
        lastRefreshEventCountRef.current = liveEventsLengthRef.current;
        refreshMetrics();
        clearLiveEvents();
      }
    }, 30_000);
    return () => {
      if (syncIntervalRef.current !== null) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [projectHash, sessionId, refreshMetrics, clearLiveEvents]);

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

  // No-op: previously opened a right panel tab; kept for onOpenPanel callback chain
  const handleOpenPanel = useCallback((_panel: string) => {}, []);

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

  if (metricsLoading && !metrics) {
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
      <div className="flex shrink-0 border-b border-dt-border bg-dt-bg">
        {(["conversation", "raw-log"] as const).map((tab) => (
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
            {tab === "conversation" ? "Conversation" : "Raw Log"}
          </button>
        ))}
        {mainTab === "raw-log" && selectedTurnIndex != null && (
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
        <>
          {!turnHistoryOpen && <ReopenBar onReopen={handleReopenTurnHistory} />}
          <ConversationView
            events={allEvents}
            turns={turns}
            metrics={metrics}
            isLive={isLive}
            sessionCwd={metrics.session.cwd}
            sessionId={metrics.session.id}
            projectHash={projectHash}
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
          />
        </>
      ) : (
        <RawLogView
          turns={turns}
          allEvents={allEvents}
          activeTurnIndex={effectiveTurnIndex}
        />
      )}
    </div>
  );
}
