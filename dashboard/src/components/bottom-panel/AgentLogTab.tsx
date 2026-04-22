import { memo, useMemo } from "react";
import type { SessionEvent, AgentDAG, SubagentMeta } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import { filterDagForTurn } from "../../lib/filterDagForTurn";
import { AgentLogs } from "../AgentLogs";

export interface AgentLogTabProps {
  allEvents: SessionEvent[];
  dag?: AgentDAG | null;
  subagentMeta?: SubagentMeta | null;
  selectedAgent?: string | null;
  onSelectAgent?: (agentId: string) => void;
  toolFilter?: string | null;
  activeTurnIndex?: number | null;
  turns?: TurnSnapshot[];
}

function AgentLogTabInner({
  allEvents,
  dag,
  subagentMeta,
  selectedAgent = null,
  onSelectAgent,
  toolFilter = null,
  activeTurnIndex,
  turns,
}: AgentLogTabProps) {
  const activeTurn = (activeTurnIndex != null && turns?.length)
    ? turns[activeTurnIndex]
    : undefined;

  const displayEvents = useMemo(() => {
    if (!activeTurn) return allEvents;
    return getEventsForTurn(activeTurn, allEvents);
  }, [allEvents, activeTurn]);

  const filteredDag = useMemo(() => {
    return filterDagForTurn(dag ?? null, activeTurn);
  }, [dag, activeTurn]);

  return (
    <AgentLogs
      events={displayEvents}
      agents={filteredDag?.nodes ?? []}
      subagentMeta={subagentMeta ?? undefined}
      selectedAgent={selectedAgent}
      toolFilter={toolFilter}
      onSelectAgent={onSelectAgent ?? (() => {})}
    />
  );
}

export const AgentLogTab = memo(AgentLogTabInner);
