import { useState, useMemo, useCallback, useEffect } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type {
  AgentDAG,
  AgentNode,
  SessionEvent,
  SubagentMeta,
} from "../../lib/types";
import { PrimaryTabs, type PrimaryTab } from "./PrimaryTabs";
import { SnapshotTabs } from "./SnapshotTabs";
import { SnapshotHistory } from "./SnapshotHistory";
import { AgentFlowDAG } from "../AgentFlowDAG";
import { AgentLogs } from "../AgentLogs";

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
  requestedTab?: "graph" | "log";
  /** Driven externally (e.g., middle-panel turn click) to sync active snapshot */
  externalActiveIndex?: number | null;
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

  // Filter events/DAG by active snapshot's turn
  const activeTurn = turns[activeSnapshotIndex];
  const filteredEvents = useMemo(() => {
    if (!activeTurn) return events;
    return activeTurn.events;
  }, [activeTurn, events]);

  const filteredDag = useMemo(() => {
    if (!dag || !activeTurn) return dag;
    // Get unique agent IDs from the active turn
    const turnAgentIds = new Set(activeTurn.agents.map((a) => a.agentId));
    // Always include "main" agent
    turnAgentIds.add("main");
    return {
      nodes: dag.nodes.filter((n) => turnAgentIds.has(n.id)),
      edges: dag.edges.filter(
        (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target),
      ),
    };
  }, [dag, activeTurn]);

  const filteredAgents = filteredDag?.nodes || [];
  const isLiveTurn = activeSnapshotIndex === turns.length - 1;

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
          activeIndex={activeSnapshotIndex}
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
        className={`flex items-center gap-1.5 px-3 py-1 bg-dt-bg2 border-b border-dt-border text-xs font-semibold ${
          isLiveTurn ? "text-dt-green" : "text-dt-text2"
        }`}
      >
        {isLiveTurn ? (
          <>
            <span className="w-1.25 h-1.25 rounded-full bg-dt-green animate-pulse-opacity" />
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
          filteredDag ? (
            <AgentFlowDAG
              dag={filteredDag}
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
        ) : (
          <AgentLogs
            events={filteredEvents}
            agents={filteredAgents}
            subagentMeta={subagentMeta}
            selectedAgent={selectedAgent}
            toolFilter={toolFilter}
            onSelectAgent={onSelectAgent}
            onSwitchToGraph={handleSwitchToGraph}
          />
        )}
      </div>
    </div>
  );
}
