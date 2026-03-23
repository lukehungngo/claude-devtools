import { useState, useMemo } from "react";
import { Layout } from "./components/Layout";
import { RepoList } from "./components/RepoList";
import { TopBar } from "./components/TopBar";
import { AgentFlowDAG } from "./components/AgentFlowDAG";
import { AgentLogs } from "./components/AgentLogs";
import { SessionViewer } from "./components/viewer/SessionViewer";
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
            // Toggle: click same tool again to clear filter
            setToolFilter((prev) => (prev === tool ? null : tool));
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
          <SessionViewer
            events={allEvents}
            metrics={metrics}
            isLive={isLive}
            sessionCwd={metrics.session.cwd}
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
      topRight={
        !selected ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-2)",
            fontSize: "12px",
          }}>
            Agent Graph
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
          <AgentFlowDAG
            dag={metrics.dag}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        ) : null
      }
      bottomRight={
        <AgentLogs
          events={allEvents}
          agents={agents}
          subagentMeta={subagentMeta}
          selectedAgent={selectedAgent}
          toolFilter={toolFilter}
          onSelectAgent={setSelectedAgent}
        />
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
