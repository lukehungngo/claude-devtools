import { useState, useCallback, useRef, useEffect } from "react";
import type { SessionMetrics, AgentDAG, SessionEvent, RepoGroup } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { TraceTab } from "./TraceTab";
import { LiveTab } from "./LiveTab";
import { CostTab } from "./CostTab";
import { DetailTab } from "./DetailTab";
import { RawTab } from "./RawTab";
import { HistoryTab } from "./HistoryTab";

export type BottomTab = "trace" | "detail" | "raw" | "live" | "history" | "cost";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "trace", label: "Trace" },
  { id: "detail", label: "Detail" },
  { id: "raw", label: "Raw" },
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
  { id: "cost", label: "Cost" },
];

export interface BottomPanelProps {
  detailCount?: number;
  children?: React.ReactNode;
  metrics?: SessionMetrics | null;
  turns?: TurnSnapshot[];
  events?: SessionEvent[];
  liveEvents?: SessionEvent[];
  dag?: AgentDAG | null;
  activeTurnIndex?: number | null;
  selectedAgent?: string | null;
  onSelectAgent?: (agentId: string) => void;
  repos?: RepoGroup[];
  projectHash?: string;
  sessionId?: string;
  isLive?: boolean;
  hasSubagents?: boolean;
}

const COLLAPSED_KEY = "bottomPanel.collapsed";

export function BottomPanel({
  detailCount,
  metrics = null,
  turns = [],
  events = [],
  liveEvents = [],
  dag = null,
  activeTurnIndex = null,
  selectedAgent = null,
  onSelectAgent,
  repos = [],
  projectHash: _projectHash,
  sessionId,
  isLive,
  hasSubagents,
}: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("trace");
  const [panelHeight, setPanelHeight] = useState(220);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);

  // TASK-010: track previous hasSubagents to detect false->true transition
  const prevHasSubagentsRef = useRef(hasSubagents ?? false);
  const manualCollapseTimeRef = useRef(0);

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isCollapsed]);

  // TASK-010: auto-expand when subagents are first detected
  useEffect(() => {
    const prev = prevHasSubagentsRef.current;
    prevHasSubagentsRef.current = hasSubagents ?? false;

    if (!prev && hasSubagents) {
      // Only auto-expand if user hasn't manually collapsed within last 5s
      const timeSinceManual = Date.now() - manualCollapseTimeRef.current;
      if (timeSinceManual > 5000) {
        setIsCollapsed(false);
        setActiveTab("trace");
      }
    }
  }, [hasSubagents]);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { y: e.clientY, height: panelHeight };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const delta = dragStartRef.current.y - ev.clientY;
        const newHeight = Math.max(80, Math.min(600, dragStartRef.current.height + delta));
        setPanelHeight(newHeight);
        setIsCollapsed(false);
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight],
  );

  const handleDividerDoubleClick = useCallback(() => {
    setIsCollapsed((prev) => {
      if (!prev) {
        // Collapsing — record timestamp for manual override
        manualCollapseTimeRef.current = Date.now();
      }
      return !prev;
    });
  }, []);

  return (
    <>
      {/* Resizable divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        onDoubleClick={handleDividerDoubleClick}
        style={{
          height: 3,
          background: "var(--bd)",
          cursor: "row-resize",
          flexShrink: 0,
          transition: "background .15s",
        }}
        className="hover:!bg-[var(--acc)]"
        role="separator"
        aria-label="Resize bottom panel"
      />

      {/* Bottom panel */}
      <div
        className="flex flex-col shrink-0"
        style={{
          background: "var(--bg-s)",
          borderTop: "1px solid var(--bd)",
        }}
      >
        {/* Tab bar */}
        <div
          className="flex shrink-0"
          style={{
            borderBottom: "1px solid var(--bd)",
            background: "var(--bg)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsCollapsed(false);
              }}
              className="flex items-center gap-[5px] cursor-pointer border-none bg-transparent"
              style={{
                padding: "8px 16px",
                fontSize: 11,
                color: activeTab === tab.id ? "var(--acc)" : "var(--t3)",
                borderBottom: `2px solid ${activeTab === tab.id ? "var(--acc)" : "transparent"}`,
                transition: "all .12s",
              }}
            >
              {tab.label}
              {tab.id === "detail" && detailCount !== undefined && detailCount > 0 && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    background: "var(--bg-s)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  {detailCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Panel body */}
        {!isCollapsed && (
          <div className="overflow-y-auto dt-scrollbar" style={{ height: panelHeight }}>
            {activeTab === "trace" ? (
              <TraceTab
                dag={dag}
                turns={turns}
                activeTurnIndex={activeTurnIndex}
                selectedAgent={selectedAgent}
                onSelectAgent={onSelectAgent}
                isLive={isLive}
                panelHeight={panelHeight}
              />
            ) : activeTab === "live" ? (
              <LiveTab events={events} liveEvents={liveEvents} isLive={isLive} />
            ) : activeTab === "cost" ? (
              <CostTab metrics={metrics} />
            ) : activeTab === "detail" ? (
              <DetailTab turns={turns} activeTurnIndex={activeTurnIndex} />
            ) : activeTab === "raw" ? (
              <RawTab turns={turns} activeTurnIndex={activeTurnIndex} />
            ) : activeTab === "history" ? (
              <HistoryTab repos={repos} currentSessionId={sessionId} />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

