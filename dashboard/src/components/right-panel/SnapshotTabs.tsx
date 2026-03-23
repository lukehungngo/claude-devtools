import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { formatCost } from "../../lib/cost";

interface SnapshotTabsProps {
  turns: TurnSnapshot[];
  activeIndex: number;
  openIndices: Set<number>;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function SnapshotTabs({
  turns,
  activeIndex,
  openIndices,
  onSelect,
  onClose,
}: SnapshotTabsProps) {
  const openTurns = turns.filter((_, i) => openIndices.has(i));

  if (openTurns.length === 0) return null;

  return (
    <div
      className="snapshot-tabs"
      style={{
        display: "flex",
        overflowX: "auto",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-2)",
        flexShrink: 0,
        scrollbarWidth: "none",
      }}
    >
      {openTurns.map((turn) => {
        const realIndex = turns.indexOf(turn);
        const isActive = realIndex === activeIndex;
        const isLive = realIndex === turns.length - 1;
        const isRunning = turn.status === "running";

        return (
          <button
            key={turn.turnNumber}
            className="snap-tab"
            onClick={() => onSelect(realIndex)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "5px 8px",
              fontSize: "10px",
              fontWeight: 600,
              fontFamily: "var(--font)",
              color: isActive
                ? isLive
                  ? "var(--accent)"
                  : "var(--text-0)"
                : "var(--text-2)",
              background: isActive ? "var(--bg-1)" : "transparent",
              border: "none",
              borderBottom: isActive
                ? `2px solid ${isLive ? "var(--accent)" : "var(--text-1)"}`
                : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            {/* Status dot */}
            <span
              className="snap-dot"
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background:
                  isRunning && isLive
                    ? "var(--accent)"
                    : turn.status === "completed"
                      ? "var(--green)"
                      : "var(--text-2)",
                animation:
                  isRunning && isLive
                    ? "pulse 1.2s ease-in-out infinite"
                    : "none",
                flexShrink: 0,
              }}
            />
            {/* Turn label */}
            <span>T{turn.turnNumber}</span>
            {/* Time */}
            <span style={{ opacity: 0.6, fontSize: "9px" }}>
              {formatTime(turn.startTime)}
            </span>
            {/* Cost */}
            {turn.cost > 0 && (
              <span style={{ opacity: 0.6, fontSize: "9px" }}>
                {formatCost(turn.cost)}
              </span>
            )}
            {/* Close button (not for live tab) */}
            {!isLive && (
              <span
                className="snap-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(realIndex);
                }}
                style={{
                  marginLeft: "2px",
                  fontSize: "10px",
                  color: "var(--text-2)",
                  cursor: "pointer",
                  opacity: 0.6,
                  lineHeight: 1,
                }}
              >
                {"\u00D7"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
