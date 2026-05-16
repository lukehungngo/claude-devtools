import { useRef, useCallback, useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { Titlebar } from "../components/Titlebar";
import { RepoList } from "../components/RepoList";
import { TopBar } from "../components/TopBar";
import { TurnHistoryPanel } from "../components/TurnHistoryPanel";
import { ProfileDrawer } from "../components/ProfileDrawer";

const BottomPanel = lazy(() =>
  import("../components/bottom-panel/BottomPanel").then(m => ({ default: m.BottomPanel }))
);
import { useRepos } from "../hooks/useRepos";
import { useUnifiedWebSocket } from "../hooks/useUnifiedWebSocket";
import { usePermissions } from "../hooks/usePermissions";
import { useUsage } from "../hooks/useUsage";
import { useCosts } from "../hooks/useCosts";
import { LayoutContext } from "../contexts/LayoutContext";
import { buildSlugMap, buildProjectHashToSlugMap } from "../lib/repoSlug";
import type { SessionWsHandlers, QuestionItem } from "../contexts/LayoutContext";
import type { SessionMetrics, SessionEvent, AgentDAG, SubagentMeta } from "../lib/types";
import type { PermissionMode } from "../components/conversation/permissionModeTypes";
import type { TurnSnapshot } from "../lib/turnSnapshot";


export function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isInsights = pathname === "/insights";
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos();
  const { permissions, decide, decideSession, handlePermissionRequest, handlePermissionResolved } = usePermissions();
  const { usage } = useUsage();
  const { costs } = useCosts();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const [activeSessionId, setActiveSessionIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("activeSessionId");
    } catch {
      return null;
    }
  });
  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdRaw(id);
    try {
      if (id) localStorage.setItem("activeSessionId", id);
      else localStorage.removeItem("activeSessionId");
    } catch { /* noop */ }
  }, []);

  // Validate restored activeSessionId is still alive on the server
  useEffect(() => {
    if (!activeSessionId) return;
    fetch("/api/sessions/active")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { sessions: Array<{ sessionId: string }> }) => {
        const alive = data.sessions?.some((s) => s.sessionId === activeSessionId);
        if (!alive) setActiveSessionId(null);
      })
      .catch(() => setActiveSessionId(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn history panel collapse state with localStorage persistence
  const [turnHistoryOpen, setTurnHistoryOpen] = useState(() => {
    try {
      const stored = localStorage.getItem("turnHistoryOpen");
      return stored !== "false"; // default true
    } catch {
      return true;
    }
  });

  // Persist turn history open state
  useEffect(() => {
    try {
      localStorage.setItem("turnHistoryOpen", String(turnHistoryOpen));
    } catch {
      // Silently fail
    }
  }, [turnHistoryOpen]);

  const toggleTurnHistory = useCallback(() => {
    setTurnHistoryOpen((prev) => !prev);
  }, []);

  // Metrics from the currently-viewed session (set by SessionPage via context)
  const [currentMetrics, setCurrentMetrics] = useState<SessionMetrics | null>(null);
  // Tool filter state (set by TopBar badge clicks, consumed by SessionPage)
  const [toolFilter, setToolFilter] = useState<string | null>(null);
  // Session data state bridged to BottomPanel
  const [currentEvents, setCurrentEvents] = useState<SessionEvent[]>([]);
  const [currentLiveEvents, setCurrentLiveEvents] = useState<SessionEvent[]>([]);
  const [currentTurns, setCurrentTurns] = useState<TurnSnapshot[]>([]);
  const [currentDag, setCurrentDag] = useState<AgentDAG | null>(null);
  const [currentActiveTurnIndex, setCurrentActiveTurnIndex] = useState<number | null>(null);
  const [currentSelectedAgent, setCurrentSelectedAgent] = useState<string | null>(null);
  const [hasSubagents, setHasSubagents] = useState(false);
  const [currentSubagentMeta, setCurrentSubagentMeta] = useState<SubagentMeta | null>(null);
  const [viewingTurnNumber, setViewingTurnNumber] = useState<number | undefined>(undefined);
  const onClearViewingTurnRef = useRef<(() => void) | null>(null);
  const onTurnClickRef = useRef<((turnIndex: number) => void) | null>(null);
  const openBottomTabRef = useRef<((tab: string) => void) | null>(null);

  // FU-3 — bidirectional Hooks↔tool_use hover correlation. Held here at the
  // common ancestor of BottomPanel (Hooks tab) and ConversationView (tool
  // blocks). Both directions are stored separately so a stray cross-update
  // never feeds back into the source of the hover.
  const [highlightedToolUseId, setHighlightedToolUseId] = useState<string | null>(null);
  const [highlightedHookId, setHighlightedHookId] = useState<string | null>(null);

  // B2-WIRE — OTel result fields bridged from ConversationView's streaming
  // state into BottomPanel's Cost tab. Reset between sessions by
  // ConversationView when the session id changes.
  const [lastResultStopReason, setLastResultStopReason] = useState<string | null>(null);
  const [lastResultFinishReasons, setLastResultFinishReasons] = useState<readonly string[] | null>(null);
  // R-4 — authoritative SDK autocompact threshold (fraction). Written by
  // UsageTab on live-session fetch, consumed by ContextWarningBanner.
  const [autoCompactThreshold, setAutoCompactThreshold] = useState<number | null>(null);

  const handleTurnSelect = useCallback((turnIndex: number) => {
    onTurnClickRef.current?.(turnIndex);
  }, []);

  const handleClearViewingTurn = useCallback(() => {
    setViewingTurnNumber(undefined);
    onClearViewingTurnRef.current?.();
  }, []);

  // Permission mode state — managed here, displayed in TopBar, applied by PromptInput
  const [permissionMode, setPermissionModeRaw] = useState<PermissionMode>(
    (currentMetrics?.permissionMode as PermissionMode) || "default",
  );
  const setPermissionMode = useCallback(
    async (mode: PermissionMode) => {
      setPermissionModeRaw(mode);
      const targetId = activeSessionId;
      if (!targetId) return;
      try {
        await fetch(`/api/sessions/${targetId}/permission-mode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
      } catch {
        // Silently fail — badge stays at new mode optimistically
      }
    },
    [activeSessionId],
  );

  // Sync permission mode from metrics when session changes
  useEffect(() => {
    if (currentMetrics?.permissionMode) {
      setPermissionModeRaw(currentMetrics.permissionMode as PermissionMode);
    }
  }, [currentMetrics?.permissionMode]);

  // Question state for AskUserQuestion
  const [questions, setQuestions] = useState<QuestionItem[]>([]);

  const handleUserQuestion = useCallback((q: { id: string; questionText: string }) => {
    setQuestions((prev) => [...prev, {
      questionId: q.id,
      questionText: q.questionText,
      status: "pending",
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  const handleQuestionAnswered = useCallback((id: string, answer: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.questionId === id ? { ...q, status: "answered" as const, answer } : q))
    );
  }, []);

  const submitAnswer = useCallback(async (questionId: string, answer: string) => {
    await fetch(`/api/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    handleQuestionAnswered(questionId, answer);
  }, [handleQuestionAnswered]);

  // Session WS handlers ref -- registered by SessionPage
  const sessionHandlersRef = useRef<SessionWsHandlers | null>(null);

  const registerSessionHandlers = useCallback((handlers: SessionWsHandlers | null) => {
    sessionHandlersRef.current = handlers;
  }, []);

  // WebSocket: delegates new-events to session-scoped handler
  const { isConnected: isLive, wsLatency } = useUnifiedWebSocket({
    onNewEvents: (sessionId, filePath, events) => {
      sessionHandlersRef.current?.onNewEvents(sessionId, filePath, events);
    },
    onNewSession: () => refreshRepos(),
    onPermissionRequest: handlePermissionRequest,
    onPermissionResolved: handlePermissionResolved,
    onUserQuestion: handleUserQuestion,
    onQuestionAnswered: handleQuestionAnswered,
  });

  // Start a new session
  async function startNewSession(cwd: string): Promise<void> {
    try {
      const res = await fetch("/api/sessions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.sessionId) {
        setActiveSessionId(data.sessionId);
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }

  // Build slug maps from repos
  const slugMap = useMemo(() => buildSlugMap(repos), [repos]);
  const reverseSlugMap = useMemo(() => buildProjectHashToSlugMap(slugMap), [slugMap]);

  // Track current selection for sidebar highlight
  const [selected, setSelected] = useState<{
    projectHash: string;
    sessionId: string;
  } | null>(null);

  const handleSelect = useCallback((s: { projectHash: string; sessionId: string }) => {
    setSelected(s);
    setToolFilter(null);
    const repoSlug = reverseSlugMap.get(s.projectHash) ?? s.projectHash;
    navigate({ to: "/session/$repoSlug/$sessionId", params: { repoSlug, sessionId: s.sessionId } });
  }, [navigate, reverseSlugMap]);

  // Get current repo info for titlebar
  const currentRepo = useMemo(() => {
    if (!selected) return null;
    return repos.find((r) =>
      r.sessions.some(
        (s) => s.projectHash === selected.projectHash && s.id === selected.sessionId,
      ),
    );
  }, [repos, selected]);

  const contextValue = {
    repos,
    reposLoading,
    refreshRepos,
    permissions,
    decidePermission: decide,
    decidePermissionSession: decideSession,
    usage,
    costs,
    isLive,
    registerSessionHandlers,
    currentMetrics,
    setCurrentMetrics,
    toolFilter,
    setToolFilter,
    questions,
    submitAnswer,
    activeSessionId,
    setActiveSessionId,
    selected,
    setSelected,
    slugMap,
    reverseSlugMap,
    currentEvents,
    setCurrentEvents,
    currentLiveEvents,
    setCurrentLiveEvents,
    currentTurns,
    setCurrentTurns,
    currentDag,
    setCurrentDag,
    currentActiveTurnIndex,
    setCurrentActiveTurnIndex,
    currentSelectedAgent,
    setCurrentSelectedAgent,
    hasSubagents,
    setHasSubagents,
    currentSubagentMeta,
    setCurrentSubagentMeta,
    permissionMode,
    setPermissionMode,
    turnHistoryOpen,
    setTurnHistoryOpen,
    viewingTurnNumber,
    setViewingTurnNumber,
    onClearViewingTurnRef,
    onTurnClickRef,
    openBottomTabRef,
    highlightedToolUseId,
    setHighlightedToolUseId,
    highlightedHookId,
    setHighlightedHookId,
    lastResultStopReason,
    setLastResultStopReason,
    lastResultFinishReasons,
    setLastResultFinishReasons,
    autoCompactThreshold,
    setAutoCompactThreshold,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <Layout
        sidebarCollapsed={isInsights ? false : sidebarCollapsed}
        onToggleSidebar={isInsights ? undefined : () => setSidebarCollapsed((prev) => !prev)}
        titlebar={
          <Titlebar
            usage={usage}
            onOpenDrawer={openDrawer}
          />
        }
        topBar={isInsights ? null : (
          <TopBar
            repoName={currentRepo?.repoName}
            branch={currentMetrics?.session.gitBranch ?? currentRepo?.gitBranch}
            metrics={currentMetrics}
            isLive={isLive}
            hasPermissionPending={permissions.some(p => p.status === "pending")}
            viewingTurnNumber={viewingTurnNumber}
            onClearViewingTurn={handleClearViewingTurn}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
          />
        )}
        sidebar={isInsights ? null : (
          <RepoList
            repos={repos}
            loading={reposLoading}
            selected={selected}
            onSelect={handleSelect}
            onRefresh={refreshRepos}
            activeSessionId={activeSessionId}
            onResumeSession={async (sessionId, cwd) => {
              try {
                await fetch(`/api/sessions/${sessionId}/resume`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ cwd }),
                });
                setActiveSessionId(sessionId);
              } catch (err) {
                console.error("Failed to resume session:", err);
              }
            }}
            onToggleTurnHistory={toggleTurnHistory}
          />
        )}
        turnHistory={isInsights ? null : (
          <TurnHistoryPanel
            turns={currentTurns}
            allEvents={currentEvents}
            // Authoritative per-session liveness flag. Matches the source used
            // by ConversationView: isActive (12-hour mtime) for JSONL sessions,
            // SDK session_state_changed for live SSE sessions. When explicitly
            // `false`, closed-session turns render as `indeterminate` (grey
            // static dot) rather than pulsing forever. Falls back to undefined
            // when no session is selected; the panel treats undefined as
            // "active" to preserve legacy behavior.
            sessionIsRunning={currentMetrics?.session?.isActive}
            activeTurnIndex={currentActiveTurnIndex}
            onSelectTurn={handleTurnSelect}
            isOpen={turnHistoryOpen}
            onToggle={toggleTurnHistory}
          />
        )}
        center={<Outlet />}
        bottomPanel={isInsights ? null : (
          <Suspense fallback={null}>
            <BottomPanel
              metrics={currentMetrics}
              turns={currentTurns}
              events={currentEvents}
              dag={currentDag}
              activeTurnIndex={currentActiveTurnIndex}
              selectedAgent={currentSelectedAgent}
              onSelectAgent={setCurrentSelectedAgent}
              sessionId={selected?.sessionId ?? ""}
              isLive={isLive}
              hasSubagents={hasSubagents}
              subagentMeta={currentSubagentMeta}
              viewingTurnNumber={viewingTurnNumber}
              openBottomTabRef={openBottomTabRef}
              onHookHover={setHighlightedToolUseId}
              highlightedHookId={highlightedHookId}
              stopReason={lastResultStopReason ?? undefined}
              finishReasons={lastResultFinishReasons ?? undefined}
            />
          </Suspense>
        )}
      />
      <ProfileDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        usage={usage}
      />
    </LayoutContext.Provider>
  );
}
