import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Phase } from "../../lib/phaseGrouping";
import { getToolBadgeColors } from "./ToolEntries";

interface PhaseGroupProps {
  phase: Phase;
  children: React.ReactNode;
}

function shallowEqualToolCounts(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function PhaseGroupInner({ phase, children }: PhaseGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolEntries = Object.entries(phase.toolCounts);

  return (
    <div
      data-testid="phase-group"
      style={{
        border: "1px solid var(--bd)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginBottom: 2,
      }}
    >
      {/* phase-head */}
      <div
        data-testid="phase-head"
        role="button"
        onClick={() => setIsExpanded((prev) => !prev)}
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
        {/* Chevron */}
        <span
          data-testid="phase-chevron"
          className="shrink-0 flex items-center"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          <ChevronRight size={12} style={{ color: "var(--t3)" }} />
        </span>

        {/* Status icon */}
        {phase.status === "running" ? (
          <span
            data-testid="phase-status"
            className="running-dot shrink-0"
            style={{ color: "var(--amb)" }}
          />
        ) : phase.status === "error" ? (
          <span
            data-testid="phase-status"
            className="shrink-0"
            style={{ fontSize: 14, color: "var(--red)" }}
          >
            {"\u2717"}
          </span>
        ) : (
          <span
            data-testid="phase-status"
            className="shrink-0"
            style={{ fontSize: 14, color: "var(--grn)" }}
          >
            {"\u2713"}
          </span>
        )}

        {/* Phase label */}
        <span
          data-testid="phase-label"
          className="flex-1 overflow-hidden whitespace-nowrap"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--t0)",
            textOverflow: "ellipsis",
          }}
        >
          {phase.label}
        </span>

        {/* Pill badges */}
        <div className="flex items-center shrink-0" style={{ gap: 4 }}>
          {toolEntries.map(([toolName, count]) => {
            const colors = getToolBadgeColors(toolName);
            return (
              <span
                key={toolName}
                data-testid="phase-pill"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: colors.bg,
                  color: colors.text,
                }}
              >
                {toolName} {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* phase-body */}
      {isExpanded && (
        <div
          data-testid="phase-body"
          style={{ borderTop: "1px solid var(--bd)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const PhaseGroup = memo(PhaseGroupInner, (prev, next) => {
  if (prev.phase.label !== next.phase.label) return false;
  if (prev.phase.status !== next.phase.status) return false;
  if (!shallowEqualToolCounts(prev.phase.toolCounts, next.phase.toolCounts))
    return false;
  if (prev.children !== next.children) return false;
  return true;
});
