import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCost, formatDuration } from "../../lib/cost";
import { ExpandHint } from "./ExpandHint";

export interface AgentCardProps {
  agentName: string;
  description: string;
  status: "running" | "success" | "error";
  toolCount?: number;
  durationMs?: number;
  cost?: number;
  children?: React.ReactNode;
}

/** Truncate a string to maxLen characters, appending ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

/** Status indicator: pulsing amber dot for running, green check for success, red X for error. */
function StatusIndicator({ status }: { status: AgentCardProps["status"] }) {
  if (status === "running") {
    return (
      <span
        aria-label="Running"
        className="running-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--amb)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    );
  }
  if (status === "success") {
    return (
      <span
        aria-label="Success"
        style={{ color: "var(--grn)", fontSize: 11, flexShrink: 0 }}
      >
        {"\u2713"}
      </span>
    );
  }
  return (
    <span
      aria-label="Error"
      style={{ color: "var(--red)", fontSize: 11, flexShrink: 0 }}
    >
      {"\u2717"}
    </span>
  );
}

/** Agent badge: 2-char colored background. */
function AgentBadge({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 5,
        fontSize: 9,
        fontWeight: 600,
        background: "var(--acc-bg)",
        color: "var(--acc)",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function AgentCardInner({
  agentName,
  description,
  status,
  toolCount,
  durationMs,
  cost,
  children,
}: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasStats =
    toolCount != null || durationMs != null || cost != null;
  const hasChildren = !!children;

  const statParts: string[] = [];
  if (toolCount != null) statParts.push(`${toolCount} tools`);
  if (durationMs != null) statParts.push(formatDuration(durationMs));
  if (cost != null) statParts.push(formatCost(cost));

  return (
    <div
      aria-label={`${agentName} subagent`}
      {...(hasChildren ? { role: "button", "aria-expanded": isExpanded } : {})}
      style={{
        borderLeft: "3px solid var(--acc)",
        background: "var(--bg-s)",
        borderRadius: "var(--radius)",
        padding: "8px 12px",
        marginTop: 6,
      }}
    >
      {/* Header line */}
      <div
        data-testid="agent-card-header"
        className={`flex items-center${hasChildren ? " group" : ""}`}
        style={{ gap: 8, cursor: hasChildren ? "pointer" : undefined }}
        onClick={hasChildren ? () => setIsExpanded((v) => !v) : undefined}
      >
        {hasChildren && (
          <ChevronRight
            data-testid="agent-card-chevron"
            size={10}
            style={{
              color: "var(--t3)",
              flexShrink: 0,
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
          />
        )}
        <StatusIndicator status={status} />
        <AgentBadge name={agentName} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--t1)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {agentName}
        </span>
        <span
          className="font-mono overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            fontSize: 11,
            color: "var(--t2)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {"\u201C"}{truncate(description, 60)}{"\u201D"}
        </span>
        {hasChildren && !isExpanded && <ExpandHint />}
      </div>

      {/* Stats line */}
      {hasStats && (
        <div
          data-testid="agent-card-stats"
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--t3)",
            marginTop: 4,
            paddingLeft: hasChildren ? 44 : 34,
          }}
        >
          {statParts.join(" \u00B7 ")}
        </div>
      )}

      {/* Expanded detail panel */}
      {hasChildren && isExpanded && (
        <div
          data-testid="agent-card-detail"
          style={{
            background: "var(--bg-s)",
            padding: "8px 10px",
            marginTop: 4,
            borderRadius: "var(--radius-xs)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const AgentCard = memo(AgentCardInner);
