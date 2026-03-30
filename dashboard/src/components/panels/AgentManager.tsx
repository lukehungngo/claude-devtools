import React, { useState, useEffect, useCallback } from "react";

interface AgentDef {
  name: string;
  description?: string;
  path: string;
}

export const AgentManager = React.memo(function AgentManager() {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/definitions");
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-dt-text2">
        Loading agents...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <div className="text-sm font-semibold text-dt-text0 uppercase tracking-wider">
        Agent Definitions
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-dt-text2 text-sm gap-2">
          <span className="text-2xl opacity-60">🤖</span>
          <span>No custom agents defined</span>
          <span className="text-xs text-dt-text3">
            Create agents in .claude/agents/&lt;name&gt;/CLAUDE.md
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="p-3 rounded-lg bg-dt-bg3/60 border border-dt-border/50"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🤖</span>
                <span className="text-sm font-medium text-dt-text0">{agent.name}</span>
              </div>
              {agent.description && (
                <div className="text-xs text-dt-text2 mt-1 line-clamp-2">{agent.description}</div>
              )}
              <div className="text-xs text-dt-text3 mt-1 font-mono truncate">{agent.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
