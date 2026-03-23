import { useState, useMemo } from "react";
import { Layout } from "./components/Layout";
import { RepoList } from "./components/RepoList";
import { TopBar } from "./components/TopBar";
import { ConversationView } from "./components/conversation/ConversationView";
import { RightPanel } from "./components/right-panel/RightPanel";
import { groupEventsIntoTurns } from "./lib/turnSnapshot";
import { useRepos } from "./hooks/useRepos";
import { useSessionMetrics } from "./hooks/useSessionData";
import { useEventStream } from "./hooks/useEventStream";
import { useUsage } from "./hooks/useUsage";
import { useCosts } from "./hooks/useCosts";
import { ThemeProvider } from "./contexts/ThemeContext";

function Dashboard() {
  const { repos, loading: reposLoading } = useRepos();
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

  const { metrics, events, subagentMeta, loading: metricsLoading } = useSessionMetrics(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null
  );
  const { liveEvents, isLive } = useEventStream(
    metrics?.session?.path ?? null
  );
  const allEvents = useMemo(
    () => [...events, ...liveEvents],
    [events, liveEvents]
  );
  const { usage } = useUsage();
  const { costs } = useCosts();

  const agents = metrics?.dag.nodes || [];
  const turns = useMemo(() => groupEventsIntoTurns(allEvents), [allEvents]);

  return (
    <Layout
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      topBar={
        <TopBar
          usage={usage}
          costs={costs}
          metrics={metrics}
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
        />
      }
      center={
        !selected ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-2)",
          }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "4px",
                color: "var(--text-0)",
                fontFamily: "var(--font-sans)",
              }}>
                Claude DevTools
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-2)" }}>
                Select a session from the sidebar to begin
              </p>
            </div>
          </div>
        ) : metricsLoading ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-2)",
          }}>
            Loading session...
          </div>
        ) : metrics ? (
          <ConversationView
            events={allEvents}
            metrics={metrics}
            isLive={isLive}
            sessionCwd={metrics.session.cwd}
            highlightedTurnIndex={highlightedTurnIndex}
            onAgentPillClick={(agentId) => {
              setSelectedAgent(agentId);
              setRequestedRightTab("log");
            }}
          />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--red)",
          }}>
            Failed to load session
          </div>
        )
      }
      rightPanel={
        !selected ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-2)",
            fontSize: "12px",
          }}>
            Agent Panel
          </div>
        ) : metricsLoading ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-2)",
            fontSize: "12px",
          }}>
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
