import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Layout } from "./components/Layout";
import { RepoList } from "./components/RepoList";
import { TopBar } from "./components/TopBar";
import { ConversationView } from "./components/conversation/ConversationView";
import { RightPanel } from "./components/right-panel/RightPanel";
import { groupEventsIntoTurns } from "./lib/turnSnapshot";
import { useRepos } from "./hooks/useRepos";
import { useSessionMetrics } from "./hooks/useSessionData";
import { useEventStream } from "./hooks/useEventStream";
import { useNewSessionListener } from "./hooks/useNewSessionListener";
import { useUnifiedWebSocket } from "./hooks/useUnifiedWebSocket";
import { usePermissions } from "./hooks/usePermissions";
import { useUsage } from "./hooks/useUsage";
import { useCosts } from "./hooks/useCosts";
import { ThemeProvider } from "./contexts/ThemeContext";

function Dashboard() {
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos();
  useNewSessionListener(refreshRepos);
  const [selected, setSelected] = useState<{
    projectHash: string;
    sessionId: string;
  } | null>(null);

  // Cross-panel shared state
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [highlightedTurnIndex, setHighlightedTurnIndex] = useState<number | undefined>(undefined);
  const [requestedRightTab, setRequestedRightTab] = useState<"graph" | "log" | undefined>(undefined);
  // Middle→right sync: turn clicked in ConversationView drives RightPanel snapshot
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  // Active session started from the web UI (for multi-turn session API)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { metrics, events, subagentMeta, loading: metricsLoading, refresh: refreshMetrics } = useSessionMetrics(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null
  );
  const { liveEvents, handleNewEvents, clearLiveEvents } = useEventStream(
    metrics?.session?.path ?? null
  );
  const { permissions, decide, handlePermissionRequest, handlePermissionResolved } = usePermissions();

  // Question state for AskUserQuestion — uses QuestionItem from ConversationView
  type QuestionItem = import("./components/conversation/ConversationView").QuestionItem;
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

  // Single multiplexed WebSocket — replaces separate WS in useEventStream,
  // useNewSessionListener, and usePermissions
  const { isConnected: isLive } = useUnifiedWebSocket({
    onNewEvents: handleNewEvents,
    onNewSession: () => refreshRepos(),
    onPermissionRequest: handlePermissionRequest,
    onPermissionResolved: handlePermissionResolved,
    onUserQuestion: handleUserQuestion,
    onQuestionAnswered: handleQuestionAnswered,
  });

  // Trigger REST refresh when live events arrive (debounced).
  // Do NOT clear liveEvents here — clear only after REST data arrives
  // to avoid a gap where the new turn disappears.
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

  // Clear live events only AFTER the REST response has landed (events changed).
  // This prevents the flash where liveEvents are gone but REST data hasn't arrived yet.
  useEffect(() => {
    if (pendingRefresh.current) {
      pendingRefresh.current = false;
      clearLiveEvents();
    }
  }, [events, clearLiveEvents]);

  // Merge REST + live events, deduplicating any overlap during the transition frame
  const allEvents = useMemo(() => {
    if (liveEvents.length === 0) return events;
    // Build a set of REST event keys for fast lookup
    const restKeys = new Set(
      events.map((e) => `${e.timestamp}|${e.type}|${e.agentId ?? ""}`)
    );
    const uniqueLive = liveEvents.filter(
      (e) => !restKeys.has(`${e.timestamp}|${e.type}|${e.agentId ?? ""}`)
    );
    return uniqueLive.length > 0 ? [...events, ...uniqueLive] : events;
  }, [events, liveEvents]);
  const { usage } = useUsage();
  const { costs } = useCosts();

  // Will be wired to a "New Session" button in a future task
  async function _startNewSession(cwd: string): Promise<void> {
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

  const agents = metrics?.dag.nodes || [];
  const turns = useMemo(() => groupEventsIntoTurns(allEvents, subagentMeta), [allEvents, subagentMeta]);

  return (
    <Layout
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      topBar={
        <TopBar
          usage={usage}
          costs={costs}
          metrics={metrics}
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
          onSelect={(s) => {
            setSelected(s);
            setSelectedAgent(null);
            setToolFilter(null);
            setHighlightedTurnIndex(undefined);
          }}
          onNewSession={() => {
            // Use cwd from selected session's repo, or first repo
            const selectedRepo = repos.find((r) =>
              r.sessions.some(
                (s) =>
                  s.projectHash === selected?.projectHash &&
                  s.id === selected?.sessionId,
              ),
            );
            const cwd = selectedRepo?.cwd ?? repos[0]?.cwd;
            if (cwd) _startNewSession(cwd);
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
      center={
        !selected ? (
          <div className="flex items-center justify-center h-full text-dt-text2">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-1 text-dt-text0 font-sans">
                Claude DevTools
              </h2>
              <p className="text-sm text-dt-text2">
                Select a session from the sidebar to begin
              </p>
            </div>
          </div>
        ) : metricsLoading && !metrics ? (
          <div className="flex items-center justify-center h-full text-dt-text2">
            Loading session...
          </div>
        ) : metrics ? (
          <ConversationView
            events={allEvents}
            metrics={metrics}
            isLive={isLive}
            sessionCwd={metrics.session.cwd}
            sessionId={metrics.session.id}
            activeSessionId={activeSessionId ?? undefined}
            highlightedTurnIndex={highlightedTurnIndex}
            permissions={permissions}
            onPermissionDecide={decide}
            questions={questions}
            onSubmitAnswer={submitAnswer}
            onAgentPillClick={(agentId) => {
              setSelectedAgent(agentId);
              setRequestedRightTab("log");
            }}
            onTurnClick={(turnIndex) => {
              setSelectedTurnIndex(turnIndex);
              setRequestedRightTab("graph");
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-dt-red">
            Failed to load session
          </div>
        )
      }
      rightPanel={
        !selected ? (
          <div className="flex items-center justify-center h-full text-sm text-dt-text2">
            Agent Panel
          </div>
        ) : metricsLoading && !metrics ? (
          <div className="flex items-center justify-center h-full text-sm text-dt-text2">
            Loading...
          </div>
        ) : metrics ? (
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
        ) : null
      }
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}
