import type { AgentSummary } from "../../lib/turnSnapshot";
import type { SessionEvent } from "../../lib/types";
import { formatCost, formatTokens } from "../../lib/cost";
import { getAgentStatus } from "../../lib/agentStatus";

interface AgentPillsProps {
  agents: AgentSummary[];
  /** Events for this turn; used to derive per-agent status via getAgentStatus. */
  turnEvents: SessionEvent[];
  /**
   * Server-side session.isRunning (SDK session_state_changed for SSE sessions,
   * mtime < 2min heuristic for JSONL sessions). When explicitly `false`, pills
   * for agents without a terminal signal render as `indeterminate` (honest
   * grey static dot) rather than "running" (pulsing amber forever). When
   * undefined, we treat the session as active to preserve legacy behavior for
   * callers/tests that don't thread it through yet.
   */
  sessionIsRunning?: boolean;
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

export function AgentPills({
  agents,
  turnEvents,
  sessionIsRunning,
  onPillClick,
}: AgentPillsProps) {
  if (agents.length === 0) return null;

  const sessionIsActive = sessionIsRunning !== false;

  return (
    <div className="conv-agent-summary flex flex-wrap gap-1.5 py-2">
      {agents.map((agent) => {
        const colors = getAgentColor(agent.agentType);
        // Three-state per-agent status — no silent collapse to "running".
        const status = getAgentStatus(agent.agentId, turnEvents, sessionIsActive);

        // Visual mapping (minimal, one line per state):
        //   running       → amber pulsing dot (class animation)
        //   completed     → green solid dot
        //   indeterminate → muted grey static dot (honest "unknown")
        const dotClass =
          status === "running"
            ? "bg-dt-accent animate-pulse-opacity"
            : status === "completed"
              ? "bg-dt-green"
              : "bg-dt-text2";
        const dotTitle =
          status === "indeterminate"
            ? "Session ended without a completion signal"
            : undefined;

        return (
          <button
            key={agent.agentId}
            onClick={() => onPillClick?.(agent.agentId)}
            className="inline-flex items-center gap-1 px-2.5 py-0.75 rounded-xl border-none text-base font-semibold font-mono cursor-pointer transition-opacity"
            style={{ background: colors.bg, color: colors.color }}
          >
            {/* Status dot */}
            <span
              data-testid={`agent-pill-dot-${agent.agentId}`}
              data-status={status}
              title={dotTitle}
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
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
            {/* Tokens */}
            {(agent.tokensIn > 0 || agent.tokensOut > 0) && (
              <span className="pill-tokens opacity-60 text-sm font-mono">
                {formatTokens(agent.tokensIn)}/{formatTokens(agent.tokensOut)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
