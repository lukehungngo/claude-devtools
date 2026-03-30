import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useSessionMetrics } from "../hooks/useSessionData";
import { useEventStream } from "../hooks/useEventStream";
import { resolveSlugToProjectHash } from "../lib/repoSlug";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental } from "../lib/turnSnapshot";
import { ConversationView } from "../components/conversation/ConversationView";

const RightPanel = lazy(() =>
  import("../components/right-panel/RightPanel").then(m => ({ default: m.RightPanel }))
);
import type { PrimaryTab } from "../components/right-panel/PrimaryTabs";

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
    setRightPanelContent,
    toolFilter,
    setToolFilter,
    requestedRightTab,
    setRequestedRightTab,
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

  // Cross-panel shared state (local to session)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);

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

  const agents = metrics?.dag.nodes || [];

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

  // Push active turn index to layout context for BottomPanel (Detail/Raw/Trace tabs)
  // Default to last turn so panels show data immediately without requiring a click
  useEffect(() => {
    const effectiveIndex = selectedTurnIndex ?? (turns.length > 0 ? turns.length - 1 : null);
    setCurrentActiveTurnIndex(effectiveIndex);
  }, [selectedTurnIndex, turns.length, setCurrentActiveTurnIndex]);

  // Auto-release turn pin when new turns arrive
  useEffect(() => {
    setSelectedTurnIndex(null);
  }, [turns.length]);

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
    setRequestedRightTab("log");
  }, [setRequestedRightTab]);

  const handleTurnClick = useCallback((turnIndex: number) => {
    setSelectedTurnIndex(turnIndex);
    setRequestedRightTab("graph");
  }, [setRequestedRightTab]);

  const handleOpenPanel = useCallback((panel: string) => {
    setRequestedRightTab(panel as PrimaryTab);
  }, [setRequestedRightTab]);

  // Render right panel content into layout context
  const rightPanel = useMemo(() => {
    if (metricsLoading && !metrics) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-dt-text2">
          Loading...
        </div>
      );
    }
    if (!metrics) return null;
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center h-full text-sm text-dt-text2">
          Loading...
        </div>
      }>
        <RightPanel
          turns={turns}
          dag={metrics.dag}
          events={allEvents}
          agents={agents}
          subagentMeta={subagentMeta}
          selectedAgent={selectedAgent}
          toolFilter={toolFilter}
          onSelectAgent={setSelectedAgent}
          onSnapshotSelect={setHighlightedTurnIndex}
          requestedTab={requestedRightTab}
          externalActiveIndex={selectedTurnIndex}
          metrics={metrics}
          usage={usage}
          projectHash={projectHash}
          sessionId={sessionId}
        />
      </Suspense>
    );
  }, [
    metricsLoading, metrics, turns, allEvents, agents, subagentMeta,
    selectedAgent, toolFilter, requestedRightTab, selectedTurnIndex,
    setHighlightedTurnIndex, usage, projectHash, sessionId,
  ]);

  useEffect(() => {
    setRightPanelContent(rightPanel);
  }, [rightPanel, setRightPanelContent]);

  // Clean up right panel and session data on unmount
  useEffect(() => {
    return () => {
      setRightPanelContent(null);
      setCurrentMetrics(null);
      setCurrentEvents([]);
      setCurrentLiveEvents([]);
      setCurrentTurns([]);
      setCurrentDag(null);
      setCurrentSelectedAgent(null);
      setCurrentActiveTurnIndex(null);
      setHasSubagents(false);
    };
  }, [setRightPanelContent, setCurrentMetrics, setCurrentEvents, setCurrentLiveEvents, setCurrentTurns, setCurrentDag, setCurrentSelectedAgent, setCurrentActiveTurnIndex, setHasSubagents]);

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
      highlightedTurnIndex={highlightedTurnIndex}
      permissions={permissions}
      onPermissionDecide={decidePermission}
      onDecideSession={decidePermissionSession}
      questions={questions}
      onSubmitAnswer={submitAnswer}
      onAgentPillClick={handleAgentPillClick}
      onTurnClick={handleTurnClick}
      onOpenPanel={handleOpenPanel}
    />
  );
}
