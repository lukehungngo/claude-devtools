import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

  const filteredDag = useMemo(() => {
    if (!dag || !activeTurn) return dag;
    // Filter DAG to agents in the active turn. Both live and snapshot
    // views use the same logic — show main + turn's agents + any
    // currently running agents (for live view only).
    const agentIds = new Set(activeTurn.agents.map((a) => a.agentId));
    agentIds.add("main");
    // In live view, also include any actively running agents from the DAG
    if (isLiveTurn) {
      for (const n of dag.nodes) {
        if (n.status === "active") agentIds.add(n.id);
      }
    }
    // Build a map of turn-level agent statuses so snapshot nodes
    // reflect the status from that turn, not the session-global status
    // (which is always "active" during a live session).
    const turnStatusMap = new Map(
      activeTurn.agents.map((a) => [a.agentId, a.status])
    );

    return {
      nodes: dag.nodes
        .filter((n) => agentIds.has(n.id))
        .map((n) => {
          const turnStatus = turnStatusMap.get(n.id);
          if (!isLiveTurn && turnStatus) {
            return { ...n, status: turnStatus === "error" ? "error" as const : turnStatus === "running" ? "active" as const : "completed" as const };
          }
          return n;
        }),
      edges: dag.edges.filter(
        (e) => agentIds.has(e.source) && agentIds.has(e.target),
      ),
    };
  }, [dag, activeTurn, isLiveTurn]);

  // Stabilize filteredDag reference: only produce a new object when the
  // DAG structure actually changes (node IDs, edges, or node statuses).
  // Without this, every REST refresh creates a new dag object reference,
  // which flows through to ReactFlow, triggering a re-measurement cascade
  // (useNodesInitialized cycles true→false→true) that makes nodes briefly
  // invisible — the root cause of the "main agent disappears" bug.
  const stableDagRef = useRef(filteredDag);
  const dagFingerprint = useMemo(() => {
    if (!filteredDag) return "";
    const nodesPart = filteredDag.nodes.map((n) => `${n.id}:${n.status}`).sort().join(",");
    const edgesPart = filteredDag.edges.map((e) => `${e.source}-${e.target}`).sort().join(",");
    return `${nodesPart}|${edgesPart}`;
  }, [filteredDag]);
  const prevDagFingerprint = useRef(dagFingerprint);
  if (dagFingerprint !== prevDagFingerprint.current) {
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
