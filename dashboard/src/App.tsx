import { useState } from "react";
import { Layout } from "./components/Layout";
import { RepoList } from "./components/RepoList";
import { TopBar } from "./components/TopBar";
import { AgentFlowDAG } from "./components/AgentFlowDAG";
import { AgentLogs } from "./components/AgentLogs";
import { BottomPanel } from "./components/BottomPanel";
import { useRepos } from "./hooks/useRepos";
import { useSessionMetrics } from "./hooks/useSessionData";
import { useUsage } from "./hooks/useUsage";
import { useCosts } from "./hooks/useCosts";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { usePermissions } from "./hooks/usePermissions";
import { ThemeProvider } from "./contexts/ThemeContext";

function Dashboard() {
  const { repos, loading: reposLoading } = useRepos();
  const [selected, setSelected] = useState<{
    projectHash: string;
    sessionId: string;
  } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("main");

  const { metrics, loading: metricsLoading } = useSessionMetrics(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null
  );
  const { usage } = useUsage();
  const { costs } = useCosts();
  const { logs, loading: logsLoading } = useAgentLogs(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null,
    selectedAgent
  );
  const { permissions, decide } = usePermissions();

  const agents = metrics?.dag.nodes || [];

  return (
    <Layout
      topBar={<TopBar usage={usage} costs={costs} metrics={metrics} />}
      leftSidebar={
        <RepoList
          repos={repos}
          loading={reposLoading}
          selected={selected}
          onSelect={(s) => {
            setSelected(s);
            setSelectedAgent("main");
          }}
        />
      }
      center={
        !selected ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-1">Claude DevTools</h2>
              <p className="text-sm">
                Select a session from the sidebar to begin
              </p>
            </div>
          </div>
        ) : metricsLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading session...
          </div>
        ) : metrics ? (
          <AgentFlowDAG dag={metrics.dag} onSelectAgent={setSelectedAgent} />
        ) : (
          <div className="flex items-center justify-center h-full text-red-400">
            Failed to load session
          </div>
        )
      }
      rightSidebar={
        <AgentLogs
          logs={logs}
          loading={logsLoading}
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
        />
      }
      bottomPanel={
        <BottomPanel permissions={permissions} onDecidePermission={decide} />
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
