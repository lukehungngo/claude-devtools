import { useState } from "react";
import { Layout } from "./components/Layout";
import { SessionSelector } from "./components/SessionSelector";
import { SummaryCards } from "./components/SummaryCards";
import { AgentFlowDAG } from "./components/AgentFlowDAG";
import { TokenChart } from "./components/TokenChart";
import { ToolStats } from "./components/ToolStats";
import { CommandInput } from "./components/CommandInput";
import { useSessions, useSessionMetrics } from "./hooks/useSessionData";

export default function App() {
  const { sessions, loading: sessionsLoading } = useSessions();
  const [selected, setSelected] = useState<{
    projectHash: string;
    sessionId: string;
  } | null>(null);

  const { metrics, loading: metricsLoading } = useSessionMetrics(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null
  );

  const [activeTab, setActiveTab] = useState<
    "flow" | "tokens" | "tools" | "command"
  >("flow");

  return (
    <Layout
      sidebar={
        <SessionSelector
          sessions={sessions}
          loading={sessionsLoading}
          selected={selected}
          onSelect={setSelected}
        />
      }
    >
      {!selected ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Claude DevTools</h2>
            <p>Select a session from the sidebar to begin</p>
          </div>
        </div>
      ) : metricsLoading ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          Loading session...
        </div>
      ) : metrics ? (
        <div className="flex flex-col h-full">
          <SummaryCards metrics={metrics} />

          {/* Tab bar */}
          <div className="flex gap-1 px-4 pt-2 border-b border-gray-800">
            {(
              [
                ["flow", "Agent Flow"],
                ["tokens", "Tokens & Cost"],
                ["tools", "Tools"],
                ["command", "Command"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm rounded-t-lg transition ${
                  activeTab === key
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === "flow" && <AgentFlowDAG dag={metrics.dag} />}
            {activeTab === "tokens" && <TokenChart metrics={metrics} />}
            {activeTab === "tools" && <ToolStats tools={metrics.tools} />}
            {activeTab === "command" && <CommandInput />}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-red-400">
          Failed to load session
        </div>
      )}
    </Layout>
  );
}
