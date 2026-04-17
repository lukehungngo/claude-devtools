import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCost, formatDuration, formatTokens } from "../../lib/cost";
import { getToolBadgeColors } from "./ToolEntries";

export interface AgentCardProps {
  agentName: string;
  description: string;
  status: "running" | "success" | "error";
  toolStats?: Array<{ name: string; count: number }>;
  durationMs?: number;
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
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
  tokensIn,
  tokensOut,
  children,
}: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = !!children;
  const initials = agentName.slice(0, 2).toUpperCase();

  return (
    <div
      aria-label={`${agentName} subagent`}
      aria-expanded={isExpanded}
      className="border border-[var(--bd)] rounded-dt overflow-hidden ml-4 mb-[2px]"
    >
      {/* Header — matches PhaseGroup phase-head */}
      <div
        data-testid="agent-card-header"
        role="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center cursor-pointer px-3.75 py-[9px] bg-[var(--bg2)] gap-2 hover:bg-[var(--bg3)]"
      >
        {/* 1. Chevron — always shown */}
        <span
          data-testid="agent-card-chevron"
          className="shrink-0 flex items-center transition-transform duration-[150ms] ease-out"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <ChevronRight size={12} className="text-[var(--t3)]" />
        </span>

        {/* 2. Status icon */}
        {status === "running" ? (
          <span
            aria-label="Running"
            className="running-dot shrink-0 text-[var(--amb)]"
          />
        ) : status === "success" ? (
          <span
            aria-label="Success"
            className="shrink-0 text-md text-[var(--grn)]"
          >
            {"\u2713"}
          </span>
        ) : (
          <span
            aria-label="Error"
            className="shrink-0 text-md text-[var(--red)]"
          >
            {"\u2717"}
          </span>
        )}

        {/* 3. AGENT label badge */}
        <span
          data-testid="agent-label-badge"
          className="shrink-0 text-xs font-semibold uppercase tracking-[0.05em] px-1.75 py-[1px] rounded-[3px] bg-[var(--pur-bg)] text-[var(--pur)]"
        >
          AGENT
        </span>

        {/* 4. Agent initials badge */}
        <span
          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-dt-sm text-xs font-semibold bg-[var(--acc-bg)] text-[var(--acc)]"
        >
          {initials}
        </span>

        {/* 5. Agent name */}
        <span
          className="shrink-0 text-lg font-semibold text-[var(--t0)]"
        >
          {agentName}
        </span>

        {/* 6. Description — quoted, truncated, mono */}
        <span
          data-testid="agent-description"
          className={`font-mono overflow-hidden text-ellipsis whitespace-nowrap text-base text-[var(--t2)] flex-1 min-w-0${status === "running" ? " pulse-opacity" : ""}`}
        >
          {"\u201C"}{truncate(description, 60)}{"\u201D"}
        </span>

        {/* 7. Tool stat pills — same as PhaseGroup */}
        {toolStats != null && toolStats.length > 0 && (
          <div className="flex items-center shrink-0 gap-1">
            {toolStats.map((stat) => {
              const colors = getToolBadgeColors(stat.name);
              return (
                <span
                  key={stat.name}
                  data-testid="agent-stat-badge"
                  className="font-mono text-xs px-[7px] py-[2px] rounded-[10px]"
                  style={{
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
            className="shrink-0 font-mono text-base text-[var(--amb)]"
          >
            {formatCost(cost)}
          </span>
        )}

        {/* 8b. Tokens */}
        {tokensIn != null && tokensOut != null && (tokensIn > 0 || tokensOut > 0) && (
          <span
            data-testid="agent-tokens"
            className="shrink-0 font-mono text-sm text-[var(--t3)]"
          >
            In: {formatTokens(tokensIn)} / Out: {formatTokens(tokensOut)}
          </span>
        )}

        {/* 9. Duration */}
        {durationMs != null && (
          <span
            data-testid="agent-duration"
            className="shrink-0 font-mono text-sm text-[var(--t3)]"
          >
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Body — expanded only, with border-top separator */}
      {isExpanded && hasChildren && (
        <div
          data-testid="agent-card-detail"
          className="border-t border-[var(--bd)]"
        >
          <div className="p-[8px_10px]">
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
  if (prev.tokensIn !== next.tokensIn) return false;
  if (prev.tokensOut !== next.tokensOut) return false;
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
