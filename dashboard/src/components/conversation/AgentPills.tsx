import type { AgentSummary } from "../../lib/turnSnapshot";
import { formatCost } from "../../lib/cost";

interface AgentPillsProps {
  agents: AgentSummary[];
  onPillClick?: (agentId: string) => void;
}

const AGENT_COLORS: Record<string, { bg: string; color: string }> = {
  main: { bg: "var(--accent-dim)", color: "var(--accent)" },
  Explore: { bg: "var(--cyan-dim)", color: "var(--cyan)" },
  Plan: { bg: "var(--yellow-dim)", color: "var(--yellow)" },
  "general-purpose": { bg: "var(--green-dim)", color: "var(--green)" },
  General: { bg: "var(--green-dim)", color: "var(--green)" },
  researcher: { bg: "var(--purple-dim, rgba(168,85,247,0.15))", color: "var(--purple, #a855f7)" },
  bugfixer: { bg: "var(--red-dim)", color: "var(--red)" },
};

function getAgentColor(agentType: string): { bg: string; color: string } {
  return (
    AGENT_COLORS[agentType] || {
      bg: "var(--bg-4)",
      color: "var(--text-2)",
    }
  );
}

export function AgentPills({ agents, onPillClick }: AgentPillsProps) {
  if (agents.length === 0) return null;

  return (
    <div className="conv-agent-summary flex flex-wrap gap-1.5 py-2">
      {agents.map((agent) => {
        const colors = getAgentColor(agent.agentType);
        const isRunning = agent.status === "running";

        return (
          <button
            key={agent.agentId}
            onClick={() => onPillClick?.(agent.agentId)}
            className="inline-flex items-center gap-1 px-2.5 py-0.75 rounded-xl border-none text-base font-semibold font-mono cursor-pointer transition-opacity"
            style={{ background: colors.bg, color: colors.color }}
          >
            {/* Status dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "bg-dt-accent animate-pulse-opacity" : "bg-dt-green"}`}
            />
            {/* Agent name */}
            <span>{agent.agentType === "main" ? "Main" : agent.agentType}</span>
            {/* Count */}
            {agent.invocationCount > 1 && (
              <span className="pill-count opacity-70 text-sm">
                x{agent.invocationCount}
              </span>
            )}
            {/* Cost */}
            {agent.cost > 0 && (
              <span className="pill-cost opacity-70 text-sm">
                {formatCost(agent.cost)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
