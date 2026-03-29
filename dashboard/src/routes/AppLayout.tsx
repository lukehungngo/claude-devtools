import { useRef, useCallback, useState, useMemo } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { RepoList } from "../components/RepoList";
import { TopBar } from "../components/TopBar";
import { useRepos } from "../hooks/useRepos";
import { useUnifiedWebSocket } from "../hooks/useUnifiedWebSocket";
import { usePermissions } from "../hooks/usePermissions";
import { useUsage } from "../hooks/useUsage";
import { useCosts } from "../hooks/useCosts";
import { LayoutContext } from "../contexts/LayoutContext";
import { buildSlugMap, buildProjectHashToSlugMap } from "../lib/repoSlug";
import type { SessionWsHandlers, QuestionItem } from "../contexts/LayoutContext";
import type { SessionMetrics } from "../lib/types";
import type { ReactNode } from "react";

export function AppLayout() {
  const navigate = useNavigate();
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos();
  const { permissions, decide, decideSession, handlePermissionRequest, handlePermissionResolved } = usePermissions();
  const { usage } = useUsage();
  const { costs } = useCosts();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Metrics from the currently-viewed session (set by SessionPage via context)
  const [currentMetrics, setCurrentMetrics] = useState<SessionMetrics | null>(null);
  // Tool filter state (set by TopBar badge clicks, consumed by SessionPage)
  const [toolFilter, setToolFilter] = useState<string | null>(null);
  const [requestedRightTab, setRequestedRightTab] = useState<"graph" | "log" | "doctor" | "stats" | "mcp" | undefined>(undefined);

  // Right panel content -- set by session page, rendered in layout slot
  const [rightPanelContent, setRightPanelContent] = useState<ReactNode>(null);

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
    setRequestedRightTab(undefined);
    const repoSlug = reverseSlugMap.get(s.projectHash) ?? s.projectHash;
    navigate({ to: "/session/$repoSlug/$sessionId", params: { repoSlug, sessionId: s.sessionId } });
  }, [navigate, reverseSlugMap]);

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
    requestedRightTab,
    setRequestedRightTab,
    rightPanelContent,
    setRightPanelContent,
    questions,
    submitAnswer,
    activeSessionId,
    setActiveSessionId,
    selected,
    setSelected,
    slugMap,
    reverseSlugMap,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <Layout
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        topBar={
          <TopBar
            usage={usage}
            costs={costs}
            metrics={currentMetrics}
            isLive={isLive}
            onToolFilter={(tool) => {
              setToolFilter((prev) => (prev === tool ? null : tool));
              setRequestedRightTab("log");
            }}
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
          />
        }
        center={<Outlet />}
        rightPanel={
          rightPanelContent ?? (
            <div className="flex items-center justify-center h-full text-sm text-dt-text2">
              Agent Panel
            </div>
          )
        }
      />
    </LayoutContext.Provider>
  );
}
