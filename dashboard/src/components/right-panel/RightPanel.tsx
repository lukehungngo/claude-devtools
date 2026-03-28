import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type {
  AgentDAG,
  AgentNode,
  SessionEvent,
  SubagentMeta,
} from "../../lib/types";
import { filterDagForTurn } from "../../lib/filterDag";
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

  // Core DAG filtering: show only agents relevant to the active turn.
  // ROOT CAUSE FIX: When activeTurn is undefined (initial load, session
  // switch, or sessions with no turn boundaries), returning the raw
  // unfiltered dag changes the node set → changes the fingerprint →
  // updates stableDagRef → triggers ReactFlow re-measurement cascade
  // (nodesReady cycles true→false→true) → layout thrash leaves nodes
  // off-screen. Fix: return the previous filtered result instead, so
  // the fingerprint stays stable and ReactFlow doesn't re-measure.
  const prevFilteredDagRef = useRef<AgentDAG | null>(null);
  const filteredDag = useMemo(() => {
    if (!dag) {
      prevFilteredDagRef.current = null;
      return null;
    }
    if (!activeTurn) return prevFilteredDagRef.current ?? dag;
    const result = filterDagForTurn(dag, activeTurn, isLiveTurn);
    prevFilteredDagRef.current = result;
    return result;
  }, [dag, activeTurn, isLiveTurn]);

  // Stabilize filteredDag reference: only produce a new object when the
  // DAG structure actually changes (node IDs, edges, or node statuses).
  // Without this, every REST refresh creates a new dag object reference,
  // which flows through to ReactFlow, triggering a re-measurement cascade
  // (useNodesInitialized cycles true→false→true) that makes nodes briefly
  // invisible.
  const stableDagRef = useRef(filteredDag);
  const dagFingerprint = useMemo(() => {
    if (!filteredDag) return "";
    const nodesPart = filteredDag.nodes.map((n) => `${n.id}:${n.status}`).sort().join(",");
    const edgesPart = filteredDag.edges.map((e) => `${e.source}-${e.target}`).sort().join(",");
    return `${nodesPart}|${edgesPart}`;
  }, [filteredDag]);
  const prevDagFingerprint = useRef(dagFingerprint);
  if (dagFingerprint !== prevDagFingerprint.current && filteredDag) {
    stableDagRef.current = filteredDag;
    prevDagFingerprint.current = dagFingerprint;
  }
  const stableDag = stableDagRef.current;

  const filteredAgents = stableDag?.nodes || [];

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
          stableDag ? (
            <AgentFlowDAG
              dag={stableDag}
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
