import { useState, useMemo, useCallback, useEffect } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { AgentDAG, AgentNode, SessionEvent, SubagentMeta } from "../../lib/types";
import { PrimaryTabs, type PrimaryTab } from "./PrimaryTabs";
import { SnapshotTabs } from "./SnapshotTabs";
import { SnapshotHistory } from "./SnapshotHistory";
import { AgentFlowDAG } from "../AgentFlowDAG";
import { AgentLogs } from "../AgentLogs";

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
}: RightPanelProps) {
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTab>("graph");
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    Math.max(0, turns.length - 1)
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

  // Keep active snapshot in sync with turns length
  useEffect(() => {
    if (turns.length > 0) {
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
    [onSnapshotSelect]
  );

  const handleSnapshotClose = useCallback((index: number) => {
    setOpenSnapshots((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleSnapshotOpen = useCallback((index: number) => {
    setOpenSnapshots((prev) => new Set([...prev, index]));
    setActiveSnapshotIndex(index);
    onSnapshotSelect?.(index);
  }, [onSnapshotSelect]);

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
        (e) => turnAgentIds.has(e.source) && turnAgentIds.has(e.target)
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
    [onSelectAgent]
  );

  const handleSwitchToGraph = useCallback(
    (agentId: string) => {
      onSelectAgent(agentId);
      setActivePrimaryTab("graph");
    },
    [onSelectAgent]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Primary tabs */}
      <PrimaryTabs
        activeTab={activePrimaryTab}
        onTabChange={setActivePrimaryTab}
        agentCount={agents.length}
        logEntryCount={filteredEvents.length}
      />

      {/* Snapshot tabs row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--bg-2)",
        }}
      >
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 12px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: "9px",
          fontWeight: 600,
          color: isLiveTurn ? "var(--green)" : "var(--text-2)",
        }}
      >
        {isLiveTurn ? (
          <>
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--green)",
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            Real-Time
          </>
        ) : (
          <>
            {"\u23F1"} Snapshot {"\u00B7"} Turn {activeTurn?.turnNumber ?? "?"}
          </>
        )}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-2)",
                fontSize: "12px",
              }}
            >
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
