import React, { useState, useEffect, useCallback } from "react";

interface AgentDef {
  name: string;
  description?: string;
  path: string;
}

/** Subset of SDK AgentInfo — mirrors @anthropic-ai/claude-agent-sdk sdk.d.ts:97-111. */
interface SdkAgent {
  name: string;
  description: string;
  model?: string;
}

interface AgentManagerProps {
  /** When set, AgentManager fetches the authoritative SDK agent list for the
   *  live session (includes plugin-contributed agents). Falls back to the
   *  filesystem hint when the SDK returns null or an empty list. */
  sessionId?: string;
}

export const AgentManager = React.memo(function AgentManager({
  sessionId,
}: AgentManagerProps = {}) {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [sdkAgents, setSdkAgents] = useState<SdkAgent[] | null>(null);
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

  const fetchSdkAgents = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/supported-agents`);
      const data = (await res.json()) as { agents: SdkAgent[] | null };
      setSdkAgents(data.agents ?? null);
    } catch {
      setSdkAgents(null);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    if (sessionId) {
      fetchSdkAgents(sessionId);
    } else {
      setSdkAgents(null);
    }
  }, [sessionId, fetchAgents, fetchSdkAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-dt-text2">
        Loading agents...
      </div>
    );
  }

  const hasSdkAgents = sdkAgents !== null && sdkAgents.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <div className="text-sm font-semibold text-dt-text0 uppercase tracking-wider">
        Agent Definitions
      </div>

      {hasSdkAgents ? (
        <div className="flex flex-col gap-2">
          {sdkAgents!.map((agent) => (
            <div
              key={agent.name}
              className="p-3 rounded-lg bg-dt-bg3/60 border border-dt-border/50"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🤖</span>
                <span className="text-sm font-medium text-dt-text0">{agent.name}</span>
                {agent.model && (
                  <span className="ml-auto text-xs text-dt-text3 font-mono">
                    {agent.model}
                  </span>
                )}
              </div>
              <div className="text-xs text-dt-text2 mt-1 line-clamp-2">
                {agent.description}
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
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
