import { memo, useMemo, useRef } from "react";
import type { AgentDAG } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { AgentFlowDAG } from "../../components/AgentFlowDAG";
import { filterDagForTurn } from "../../lib/filterDagForTurn";

/** Height of the tab bar in pixels */
const TAB_BAR_HEIGHT = 37;

export interface TraceTabProps {
  dag: AgentDAG | null;
  turns: TurnSnapshot[];
  activeTurnIndex: number | null;
  selectedAgent: string | null;
  onSelectAgent?: (agentId: string) => void;
  isLive?: boolean;
  panelHeight: number;
}

function TraceTabInner({
  dag,
  turns,
  activeTurnIndex,
  selectedAgent,
  onSelectAgent,
  isLive,
  panelHeight,
}: TraceTabProps) {
  const prevFilteredRef = useRef<AgentDAG | null>(null);

  const activeTurn =
    activeTurnIndex !== null && activeTurnIndex >= 0 && activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const filteredDag = useMemo(() => {
    const result = filterDagForTurn(dag, activeTurn, prevFilteredRef.current);
    prevFilteredRef.current = result;
    return result;
  }, [dag, activeTurn]);

  const isEmpty = !filteredDag || filteredDag.nodes.length === 0;
  const contentHeight = panelHeight - TAB_BAR_HEIGHT;

  if (isEmpty) {
    return (
      <div
        style={{ height: contentHeight }}
        className="flex items-center justify-center"
      >
        <span style={{ color: "var(--t3)", fontSize: 13 }}>No agent data</span>
      </div>
    );
  }

  return (
    <div style={{ height: contentHeight }}>
      <AgentFlowDAG
        dag={filteredDag}
        selectedAgent={selectedAgent}
        onSelectAgent={onSelectAgent}
        frozen={!isLive}
      />
    </div>
  );
}

export const TraceTab = memo(TraceTabInner);
