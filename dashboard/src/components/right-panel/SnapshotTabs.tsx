import { useRef, useEffect } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { formatCost } from "../../lib/cost";
import { formatTimeShort } from "../../lib/formatTime";

/** Exported for overflow regression tests (TASK-005) */
export const SNAPSHOT_TABS_ROOT_CLASS =
  "snapshot-tabs flex-1 min-w-0 overflow-x-auto border-b border-dt-border bg-dt-bg2 [scrollbar-width:none] dt-scrollbar";

interface SnapshotTabsProps {
  turns: TurnSnapshot[];
  activeIndex: number;
  openIndices: Set<number>;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
}

export function SnapshotTabs({
  turns,
  activeIndex,
  openIndices,
  onSelect,
  onClose,
}: SnapshotTabsProps) {
  const openTurns = turns.filter((_, i) => openIndices.has(i));
  const tabRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Scroll active tab into view when activeIndex changes
  useEffect(() => {
    const el = tabRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeIndex]);

  if (openTurns.length === 0) return null;

  return (
    <div className={SNAPSHOT_TABS_ROOT_CLASS}>
      {openTurns.map((turn) => {
        const realIndex = turns.indexOf(turn);
        const isActive = realIndex === activeIndex;
        const isLive = realIndex === turns.length - 1;
        const isRunning = turn.status === "running";

        return (
          <button
            key={turn.turnNumber}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(realIndex, el);
              } else {
                tabRefs.current.delete(realIndex);
              }
            }}
            onClick={() => onSelect(realIndex)}
            className={`flex items-center gap-1 pl-2.5 pr-2 py-1.5 text-md font-semibold font-mono border-none cursor-pointer whitespace-nowrap transition-all shrink-0 border-b-2 ${
              isActive
                ? `${isLive ? "text-dt-accent border-dt-accent" : "text-dt-text0 border-dt-text1"} bg-dt-bg1`
                : "text-dt-text2 border-transparent bg-transparent"
            }`}
          >
            {/* Status dot */}
            <span
              className={`w-1.25 h-1.25 rounded-full shrink-0 ${
                isRunning && isLive
                  ? "bg-dt-accent animate-pulse-opacity"
                  : turn.status === "completed"
                    ? "bg-dt-green"
                    : "bg-dt-text2"
              }`}
            />
            {/* Turn label */}
            <span>T{turn.turnNumber}</span>
            {/* Time */}
            <span className="opacity-60 text-sm">
              {formatTimeShort(turn.startTime)}
            </span>
            {/* Cost */}
            {turn.cost > 0 && (
              <span className="opacity-60 text-sm">
                {formatCost(turn.cost)}
              </span>
            )}
            {/* Close button (not for live tab) */}
            {!isLive && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(realIndex);
                }}
                className="ml-0.5 text-sm text-dt-text2 cursor-pointer opacity-60 leading-none"
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
