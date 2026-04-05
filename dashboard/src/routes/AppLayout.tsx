import { useRef, useCallback, useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { Titlebar } from "../components/Titlebar";
import { RepoList } from "../components/RepoList";
import { TopBar } from "../components/TopBar";
import { TurnHistoryPanel } from "../components/TurnHistoryPanel";

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
import type { SessionWsHandlers, QuestionItem, SessionControlState } from "../contexts/LayoutContext";
import type { SessionMetrics, SessionEvent, AgentDAG, SubagentMeta } from "../lib/types";
import type { PermissionMode } from "../components/conversation/permissionModeTypes";
import type { TurnSnapshot } from "../lib/turnSnapshot";


export function AppLayout() {
  const navigate = useNavigate();
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos();
  const { permissions, decide, decideSession, handlePermissionRequest, handlePermissionResolved } = usePermissions();
  const { usage } = useUsage();
  const { costs } = useCosts();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      .then((r) => r.json())
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

  // Session control state (Phase 5) — set by SessionPage, consumed by TopBar
  const [sessionControl, setSessionControl] = useState<SessionControlState | null>(null);

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
  const { isConnected: isLive } = useUnifiedWebSocket({
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
    sessionControl,
    setSessionControl,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <Layout
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        titlebar={
          <Titlebar
            repoName={currentRepo?.repoName}
            branch={currentMetrics?.session.gitBranch ?? currentRepo?.gitBranch}
          />
        }
        topBar={
          <TopBar
            metrics={currentMetrics}
            isLive={isLive}
            hasPermissionPending={permissions.length > 0}
            viewingTurnNumber={viewingTurnNumber}
            onClearViewingTurn={handleClearViewingTurn}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            availableModels={sessionControl?.availableModels}
            fastMode={sessionControl?.fastMode}
            effort={sessionControl?.effort}
            onModelSelect={sessionControl?.onModelSelect}
            onFastToggle={sessionControl?.onFastToggle}
            onEffortChange={sessionControl?.onEffortChange}
            onCompact={sessionControl?.onCompact}
          />
        }
        sidebar={
          <RepoList
            repos={repos}
            loading={reposLoading}
            selected={selected}
            onSelect={handleSelect}
            onNewSession={() => {
              const selectedRepo = repos.find((r) =>
                r.sessions.some(
                  (s) =>
                    s.projectHash === selected?.projectHash &&
                    s.id === selected?.sessionId,
                ),
              );
              const cwd = selectedRepo?.cwd ?? repos[0]?.cwd;
              if (cwd) startNewSession(cwd);
            }}
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
            usage={usage}
            isConnected={isLive}
          />
        }
        turnHistory={
          <TurnHistoryPanel
            turns={currentTurns}
            activeTurnIndex={currentActiveTurnIndex}
            onSelectTurn={handleTurnSelect}
            isOpen={turnHistoryOpen}
            onToggle={toggleTurnHistory}
          />
        }
        center={<Outlet />}
        bottomPanel={
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
            />
          </Suspense>
        }
      />
    </LayoutContext.Provider>
  );
}
