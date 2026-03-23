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
    <div
      className="conv-agent-summary"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        padding: "8px 0",
      }}
    >
      {agents.map((agent) => {
        const colors = getAgentColor(agent.agentType);
        const isRunning = agent.status === "running";

        return (
          <button
            key={agent.agentId}
            className="conv-agent-pill"
            onClick={() => onPillClick?.(agent.agentId)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "4px",
              border: "none",
              background: colors.bg,
              color: colors.color,
              fontSize: "10px",
              fontWeight: 600,
              fontFamily: "var(--font)",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {/* Status dot */}
            <span
              className="pill-status"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: isRunning
                  ? "var(--accent)"
                  : "var(--green)",
                animation: isRunning
                  ? "pulse 1.2s ease-in-out infinite"
                  : "none",
                flexShrink: 0,
              }}
            />
            {/* Agent name */}
            <span>{agent.agentType === "main" ? "Main" : agent.agentType}</span>
            {/* Count */}
            {agent.invocationCount > 1 && (
              <span
                className="pill-count"
                style={{
                  opacity: 0.7,
                  fontSize: "9px",
                }}
              >
                x{agent.invocationCount}
              </span>
            )}
            {/* Cost */}
            {agent.cost > 0 && (
              <span
                className="pill-cost"
                style={{
                  opacity: 0.7,
                  fontSize: "9px",
                }}
              >
                {formatCost(agent.cost)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
