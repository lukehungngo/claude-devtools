import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { SessionMetrics, AgentDAG, SessionEvent, SubagentMeta } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { TraceTab } from "./TraceTab";
import { CostTab } from "./CostTab";
import { DetailTab } from "./DetailTab";
import { TasksTab } from "./TasksTab";
import { HooksTab } from "./HooksTab";
import { deriveSessionTasks } from "../../lib/sessionTasks";
export type BottomTab = "agent-graph" | "tool-call" | "cost" | "tasks" | "hooks";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "agent-graph", label: "Agent Graph" },
  { id: "tool-call", label: "Tool Call" },
  { id: "cost", label: "Cost" },
  { id: "tasks", label: "Tasks" },
  { id: "hooks", label: "Hooks" },
];

export interface BottomPanelProps {
  detailCount?: number;
  children?: React.ReactNode;
  metrics?: SessionMetrics | null;
  turns?: TurnSnapshot[];
  events?: SessionEvent[];

  dag?: AgentDAG | null;
  activeTurnIndex?: number | null;
  selectedAgent?: string | null;
  onSelectAgent?: (agentId: string) => void;
  sessionId?: string;
  isLive?: boolean;
  hasSubagents?: boolean;
  /** Currently viewed turn number — drives the scope pill in the tab bar */
  viewingTurnNumber?: number;
  subagentMeta?: SubagentMeta | null;
  /** Ref-based callback to switch tab programmatically without re-renders */
  openBottomTabRef?: MutableRefObject<((tab: string) => void) | null>;
}

const COLLAPSED_KEY = "bottomPanel.collapsed";
const HEIGHT_KEY = "bottomPanel.height";

export function BottomPanel({
  detailCount,
  metrics = null,
  turns = [],
  events = [],

  dag = null,
  activeTurnIndex = null,
  selectedAgent = null,
  onSelectAgent,
  sessionId: _sessionId,
  isLive,
  hasSubagents,
  viewingTurnNumber,
  subagentMeta = null,
  openBottomTabRef,
}: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("agent-graph");
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      const stored = localStorage.getItem(HEIGHT_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed) && parsed >= 80 && parsed <= 600) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return 220;
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      // When no stored value (first visit), default to collapsed (true).
      // When explicitly "false", respect that.
      return stored !== "false";
    } catch {
      return true;
    }
  });
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);
  const sessionTasks = useMemo(() => deriveSessionTasks(events), [events]);

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

  // Persist panel height to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HEIGHT_KEY, String(panelHeight));
    } catch {
      // ignore storage errors
    }
  }, [panelHeight]);

  // TASK-010: auto-expand when subagents are first detected
  useEffect(() => {
    const prev = prevHasSubagentsRef.current;
    prevHasSubagentsRef.current = hasSubagents ?? false;

    if (!prev && hasSubagents) {
      // Only auto-expand if user hasn't manually collapsed within last 5s
      const timeSinceManual = Date.now() - manualCollapseTimeRef.current;
      if (timeSinceManual > 5000) {
        setIsCollapsed(false);
        setActiveTab("agent-graph");
      }
    }
  }, [hasSubagents]);

  // Register ref-based callback for programmatic tab switching (TASK-006)
  useEffect(() => {
    if (openBottomTabRef) {
      openBottomTabRef.current = (tab: string) => {
        setActiveTab(tab as BottomTab);
        setIsCollapsed(false);
      };
      return () => {
        openBottomTabRef.current = null;
      };
    }
  }, [openBottomTabRef]);

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
              {tab.id === "tool-call" && detailCount !== undefined && detailCount > 0 && (
                <span
                  className="t-mono-xs"
                  style={{
                    color: "inherit",
                    background: "var(--bg-s)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  {detailCount}
                </span>
              )}
              {tab.id === "tasks" && sessionTasks.length > 0 && (
                <span
                  className="t-mono-xs"
                  style={{
                    color: "inherit",
                    background: "var(--bg-s)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  {sessionTasks.length}
                </span>
              )}
            </button>
          ))}
          {viewingTurnNumber !== undefined && (
            <div className="ml-auto flex items-center gap-[3px] t-caption pr-2">
              Scoped to{" "}
              <span className="font-mono text-[10px] font-semibold text-dt-accent bg-dt-accent-bg px-[5px] py-[1px] rounded-[3px]">
                T{viewingTurnNumber}
              </span>
            </div>
          )}
        </div>

        {/* Panel body */}
        {!isCollapsed && (
          <div className="overflow-y-auto dt-scrollbar" style={{ height: panelHeight }}>
            {activeTab === "agent-graph" ? (
              <TraceTab
                dag={dag}
                turns={turns}
                activeTurnIndex={activeTurnIndex}
                selectedAgent={selectedAgent}
                onSelectAgent={onSelectAgent}
                isLive={isLive}
                panelHeight={panelHeight}
              />
            ) : activeTab === "tool-call" ? (
              <DetailTab turns={turns} allEvents={events} activeTurnIndex={activeTurnIndex} />
            ) : activeTab === "cost" ? (
              <CostTab metrics={metrics} />
            ) : activeTab === "tasks" ? (
              <TasksTab tasks={sessionTasks} />
            ) : activeTab === "hooks" ? (
              <HooksTab events={events} activeTurnIndex={activeTurnIndex} />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

