import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useSessionMetrics } from "../hooks/useSessionData";
import { useEventStream } from "../hooks/useEventStream";
import { resolveSlugToProjectHash } from "../lib/repoSlug";
import { groupEventsIntoTurns } from "../lib/turnSnapshot";
import { ConversationView } from "../components/conversation/ConversationView";
import { RightPanel } from "../components/right-panel/RightPanel";

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
    setRightPanelContent,
    toolFilter,
    setToolFilter,
    requestedRightTab,
    setRequestedRightTab,
    permissions,
    decidePermission,
    questions,
    submitAnswer,
    activeSessionId,
    setActiveSessionId,
    setSelected,
    slugMap,
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

  // Cross-panel shared state (local to session)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);

  // Trigger REST refresh when live events arrive (debounced)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefresh = useRef(false);
  useEffect(() => {
    if (liveEvents.length === 0) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pendingRefresh.current = true;
      refreshMetrics();
      debounceRef.current = null;
    }, 500);
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [liveEvents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear live events only AFTER the REST response has landed
  useEffect(() => {
    if (pendingRefresh.current) {
      pendingRefresh.current = false;
      clearLiveEvents();
    }
  }, [events, clearLiveEvents]);

  // Merge REST + live events, deduplicating by event UUID
  const allEvents = useMemo(() => {
    if (liveEvents.length === 0) return events;
    const restKeys = new Set(events.map((e) => e.uuid));
    const uniqueLive = liveEvents.filter((e) => !restKeys.has(e.uuid));
    return uniqueLive.length > 0 ? [...events, ...uniqueLive] : events;
  }, [events, liveEvents]);

  const agents = metrics?.dag.nodes || [];
  const turns = useMemo(() => groupEventsIntoTurns(allEvents, subagentMeta), [allEvents, subagentMeta]);

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

  const handleAgentPillClick = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    setRequestedRightTab("log");
  }, [setRequestedRightTab]);

  const handleTurnClick = useCallback((turnIndex: number) => {
    setSelectedTurnIndex(turnIndex);
    setRequestedRightTab("graph");
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
      />
    );
  }, [
    metricsLoading, metrics, turns, allEvents, agents, subagentMeta,
    selectedAgent, toolFilter, requestedRightTab, selectedTurnIndex,
    setHighlightedTurnIndex,
  ]);

  useEffect(() => {
    setRightPanelContent(rightPanel);
  }, [rightPanel, setRightPanelContent]);

  // Clean up right panel and metrics on unmount
  useEffect(() => {
    return () => {
      setRightPanelContent(null);
      setCurrentMetrics(null);
    };
  }, [setRightPanelContent, setCurrentMetrics]);

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
      metrics={metrics}
      isLive={isLive}
      sessionCwd={metrics.session.cwd}
      sessionId={metrics.session.id}
      activeSessionId={activeSessionId ?? undefined}
      onSessionStarted={setActiveSessionId}
      highlightedTurnIndex={highlightedTurnIndex}
      permissions={permissions}
      onPermissionDecide={decidePermission}
      questions={questions}
      onSubmitAnswer={submitAnswer}
      onAgentPillClick={handleAgentPillClick}
      onTurnClick={handleTurnClick}
    />
  );
}
