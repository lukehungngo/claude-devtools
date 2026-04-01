import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCost, formatDuration } from "../../lib/cost";
import { getToolBadgeColors } from "./ToolEntries";

export interface AgentCardProps {
  agentName: string;
  description: string;
  status: "running" | "success" | "error";
  toolStats?: Array<{ name: string; count: number }>;
  durationMs?: number;
  cost?: number;
  children?: React.ReactNode;
}

/** Truncate a string to maxLen characters, appending ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

function AgentCardInner({
  agentName,
  description,
  status,
  toolStats,
  durationMs,
  cost,
  children,
}: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = !!children;
  const initials = agentName.slice(0, 2).toUpperCase();

  return (
    <div
      aria-label={`${agentName} subagent`}
      aria-expanded={isExpanded}
      style={{
        border: "1px solid var(--bd)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginLeft: 16,
        marginBottom: 2,
      }}
    >
      {/* Header — matches PhaseGroup phase-head */}
      <div
        data-testid="agent-card-header"
        role="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center cursor-pointer"
        style={{
          padding: "9px 14px",
          background: "var(--bg2)",
          gap: 8,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg2)";
        }}
      >
        {/* 1. Chevron — always shown */}
        <span
          data-testid="agent-card-chevron"
          className="shrink-0 flex items-center"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          <ChevronRight size={12} style={{ color: "var(--t3)" }} />
        </span>

        {/* 2. Status icon */}
        {status === "running" ? (
          <span
            aria-label="Running"
            className="running-dot shrink-0"
            style={{ color: "var(--amb)" }}
          />
        ) : status === "success" ? (
          <span
            aria-label="Success"
            className="shrink-0"
            style={{ fontSize: 12, color: "var(--grn)" }}
          >
            {"\u2713"}
          </span>
        ) : (
          <span
            aria-label="Error"
            className="shrink-0"
            style={{ fontSize: 12, color: "var(--red)" }}
          >
            {"\u2717"}
          </span>
        )}

        {/* 3. AGENT label badge */}
        <span
          data-testid="agent-label-badge"
          className="shrink-0"
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "1px 6px",
            borderRadius: 3,
            background: "var(--pur-bg)",
            color: "var(--pur)",
          }}
        >
          AGENT
        </span>

        {/* 4. Agent initials badge */}
        <span
          className="shrink-0 inline-flex items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 600,
            background: "var(--acc-bg)",
            color: "var(--acc)",
          }}
        >
          {initials}
        </span>

        {/* 5. Agent name */}
        <span
          className="shrink-0"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--t0)",
          }}
        >
          {agentName}
        </span>

        {/* 6. Description — quoted, truncated, mono */}
        <span
          data-testid="agent-description"
          className={`font-mono overflow-hidden text-ellipsis whitespace-nowrap${status === "running" ? " pulse-opacity" : ""}`}
          style={{
            fontSize: 11,
            color: "var(--t2)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {"\u201C"}{truncate(description, 60)}{"\u201D"}
        </span>

        {/* 7. Tool stat pills — same as PhaseGroup */}
        {toolStats != null && toolStats.length > 0 && (
          <div className="flex items-center shrink-0" style={{ gap: 4 }}>
            {toolStats.map((stat) => {
              const colors = getToolBadgeColors(stat.name);
              return (
                <span
                  key={stat.name}
                  data-testid="agent-stat-badge"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    padding: "2px 7px",
                    borderRadius: 10,
                    background: colors.bg,
                    color: colors.text,
                  }}
                >
                  {stat.name} {stat.count}
                </span>
              );
            })}
          </div>
        )}

        {/* 8. Cost */}
        {cost != null && (
          <span
            data-testid="agent-cost"
            className="shrink-0"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--amb)",
            }}
          >
            {formatCost(cost)}
          </span>
        )}

        {/* 9. Duration */}
        {durationMs != null && (
          <span
            data-testid="agent-duration"
            className="shrink-0"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--t3)",
            }}
          >
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Body — expanded only, with border-top separator */}
      {isExpanded && hasChildren && (
        <div
          data-testid="agent-card-detail"
          style={{ borderTop: "1px solid var(--bd)" }}
        >
          <div
            style={{
              padding: "8px 10px",
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export const AgentCard = memo(AgentCardInner, (prev, next) => {
  if (prev.agentName !== next.agentName) return false;
  if (prev.description !== next.description) return false;
  if (prev.status !== next.status) return false;
  if (prev.durationMs !== next.durationMs) return false;
  if (prev.cost !== next.cost) return false;
  if (prev.children !== next.children) return false;
  // Shallow compare toolStats
  const a = prev.toolStats;
  const b = next.toolStats;
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].count !== b[i].count) return false;
  }
  return true;
});
