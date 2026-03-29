import { useState, useMemo, useCallback, useEffect } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type {
  AgentDAG,
  AgentNode,
  SessionEvent,
  SessionMetrics,
  SubagentMeta,
  UsageInfo,
} from "../../lib/types";
import { PrimaryTabs, type PrimaryTab } from "./PrimaryTabs";
import { SnapshotTabs } from "./SnapshotTabs";
import { SnapshotHistory } from "./SnapshotHistory";
import { AgentFlowDAG } from "../AgentFlowDAG";
import { AgentLogs } from "../AgentLogs";
import { SettingsPanel } from "../panels/SettingsPanel";
import { HookEditor } from "../panels/HookEditor";
import { MemoryEditor } from "../panels/MemoryEditor";
import { DoctorPanel } from "../panels/DoctorPanel";
import { StatsPanel } from "../panels/StatsPanel";
import { McpManager } from "../panels/McpManager";
import { filterDagForTurn } from "../../lib/filterDagForTurn";

/** Exported for overflow regression tests (TASK-005) */
export const SNAPSHOT_ROW_WRAPPER_CLASS =
  "flex items-center bg-dt-bg2 min-w-0 overflow-hidden";

/** Exported for overflow regression tests (TASK-005) */
export const TAB_CONTENT_WRAPPER_CLASS = "flex-1 min-w-0 overflow-hidden";

interface RightPanelProps {
  turns: TurnSnapshot[];
  dag: AgentDAG | null;
  events: SessionEvent[];
  agents: AgentNode[];
  subagentMeta?: SubagentMeta;
  selectedAgent: string | null;
  toolFilter: string | null;
  onSelectAgent: (id: string) => void;
  onSnapshotSelect?: (turnIndex: number) => void;
  requestedTab?: PrimaryTab;
  /** Driven externally (e.g., middle-panel turn click) to sync active snapshot */
  externalActiveIndex?: number | null;
  /** Session metrics for Settings panel */
  metrics?: SessionMetrics | null;
  /** Usage info for Settings panel */
  usage?: UsageInfo | null;
  /** Project hash for Memory panel API */
  projectHash?: string;
  /** Session ID for Memory panel API */
  sessionId?: string;
}

export function RightPanel({
  turns,
  dag,
  events,
  agents,
  subagentMeta,
  selectedAgent,
  toolFilter,
  onSelectAgent,
  onSnapshotSelect,
  requestedTab,
  externalActiveIndex,
  metrics,
  usage,
  projectHash,
  sessionId,
}: RightPanelProps) {
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTab>("graph");
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    Math.max(0, turns.length - 1),
  );
  const [openSnapshots, setOpenSnapshots] = useState<Set<number>>(() => {
    // Open last 3 turns by default
    const indices = new Set<number>();
    for (let i = Math.max(0, turns.length - 3); i < turns.length; i++) {
      indices.add(i);
    }
    return indices;
  });

  // Switch tab when requested externally (e.g., agent pill click, tool badge click)
  useEffect(() => {
    if (requestedTab) {
      setActivePrimaryTab(requestedTab);
    }
  }, [requestedTab, selectedAgent, toolFilter]);

  // Sync active snapshot when driven from outside (e.g., middle-panel turn click).
  // Guard: do NOT call onSnapshotSelect here — that would create a feedback loop.
  useEffect(() => {
    if (externalActiveIndex != null) {
      setActiveSnapshotIndex(externalActiveIndex);
      setOpenSnapshots((prev) => {
        if (prev.has(externalActiveIndex)) return prev;
        return new Set([...prev, externalActiveIndex]);
      });
    }
  }, [externalActiveIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep active snapshot in sync with turns length.
  // Skip auto-advance when an external index is driving the selection.
  useEffect(() => {
    if (turns.length > 0 && externalActiveIndex == null) {
      const lastIndex = turns.length - 1;
      if (!openSnapshots.has(lastIndex)) {
        setOpenSnapshots((prev) => new Set([...prev, lastIndex]));
      }
      setActiveSnapshotIndex(lastIndex);
    }
  }, [turns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSnapshotSelect = useCallback(
    (index: number) => {
      setActiveSnapshotIndex(index);
      onSnapshotSelect?.(index);
    },
    [onSnapshotSelect],
  );

  const handleSnapshotClose = useCallback((index: number) => {
    setOpenSnapshots((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleSnapshotOpen = useCallback(
    (index: number) => {
      setOpenSnapshots((prev) => new Set([...prev, index]));
      setActiveSnapshotIndex(index);
      onSnapshotSelect?.(index);
    },
    [onSnapshotSelect],
  );

  // Clamp activeSnapshotIndex to valid range (turns may have shrunk
  // on session switch). No auto-advance — that's handled by the
  // useEffect on turns.length which calls setActiveSnapshotIndex.
  const effectiveSnapshotIndex = externalActiveIndex != null
    ? Math.min(externalActiveIndex, Math.max(0, turns.length - 1))
    : Math.min(activeSnapshotIndex, Math.max(0, turns.length - 1));

  const activeTurn = turns[effectiveSnapshotIndex];
  const isLiveTurn = effectiveSnapshotIndex >= turns.length - 1;

  const filteredEvents = useMemo(() => {
    if (!activeTurn) return events;
    return activeTurn.events;
  }, [activeTurn, events]);

  // Filter DAG to only agents used in the active turn (+ main always).
  // With route-based session isolation, filtering is safe — no cross-session
  // contamination, no transient undefined states, no stableDagRef chain.
  // When a brand-new turn has no agents yet, show the full DAG to prevent
  // graph nodes from disappearing on new prompt (TASK-003).
  const turnDag = useMemo(
    () => filterDagForTurn(dag, activeTurn),
    [dag, activeTurn],
  );

  const filteredAgents = turnDag?.nodes ?? [];

  const handleAgentSelect = useCallback(
    (agentId: string) => {
      onSelectAgent(agentId);
      setActivePrimaryTab("log");
    },
    [onSelectAgent],
  );

  const handleSwitchToGraph = useCallback(
    (agentId: string) => {
      onSelectAgent(agentId);
      setActivePrimaryTab("graph");
    },
    [onSelectAgent],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Primary tabs */}
      <PrimaryTabs
        activeTab={activePrimaryTab}
        onTabChange={setActivePrimaryTab}
        agentCount={agents.length}
        logEntryCount={filteredEvents.length}
      />

      {/* Snapshot tabs row */}
      <div className={SNAPSHOT_ROW_WRAPPER_CLASS}>
        <SnapshotTabs
          turns={turns}
          activeIndex={effectiveSnapshotIndex}
          openIndices={openSnapshots}
          onSelect={handleSnapshotSelect}
          onClose={handleSnapshotClose}
        />
        <SnapshotHistory
          turns={turns}
          openIndices={openSnapshots}
          onOpen={handleSnapshotOpen}
        />
      </div>

      {/* Freeze/live badge */}
      <div
        className={`flex items-center gap-2 px-4 py-1.5 bg-dt-bg2/60 border-b border-dt-border/50 text-xs font-semibold ${
          isLiveTurn ? "text-dt-green" : "text-dt-text2"
        }`}
      >
        {isLiveTurn ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-dt-green animate-pulse-opacity shadow-[0_0_6px_var(--green)]" />
            Real-Time
          </>
        ) : (
          <>
            {"\u23F1"} Snapshot {"\u00B7"} Turn {activeTurn?.turnNumber ?? "?"}
          </>
        )}
      </div>

      {/* Tab content */}
      <div className={TAB_CONTENT_WRAPPER_CLASS}>
        {activePrimaryTab === "graph" ? (
          turnDag ? (
            <AgentFlowDAG
              dag={turnDag}
              selectedAgent={selectedAgent}
              onSelectAgent={handleAgentSelect}
              frozen={!isLiveTurn}
              onViewInLog={handleAgentSelect}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
              No agent data
            </div>
          )
        ) : activePrimaryTab === "log" ? (
          <AgentLogs
            events={filteredEvents}
            agents={filteredAgents}
            subagentMeta={subagentMeta}
            selectedAgent={selectedAgent}
            toolFilter={toolFilter}
            onSelectAgent={onSelectAgent}
            onSwitchToGraph={handleSwitchToGraph}
          />
        ) : activePrimaryTab === "settings" ? (
          <SettingsPanel metrics={metrics ?? null} usage={usage ?? null} />
        ) : activePrimaryTab === "hooks" ? (
          <HookEditor />
        ) : activePrimaryTab === "memory" ? (
          <MemoryEditor projectHash={projectHash} sessionId={sessionId} />
        ) : activePrimaryTab === "doctor" ? (
          <DoctorPanel />
        ) : activePrimaryTab === "stats" ? (
          <StatsPanel />
        ) : activePrimaryTab === "mcp" ? (
          <McpManager servers={[]} />
        ) : null}
      </div>
    </div>
  );
}
