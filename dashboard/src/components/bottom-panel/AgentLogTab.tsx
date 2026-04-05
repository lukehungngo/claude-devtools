import { memo, useMemo } from "react";
import type { SessionEvent, AgentDAG, SubagentMeta } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";
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
  const displayEvents = useMemo(() => {
    if (activeTurnIndex == null || !turns?.length) return allEvents;
    const turn = turns[activeTurnIndex];
    if (!turn) return allEvents;
    return getEventsForTurn(turn, allEvents);
  }, [allEvents, activeTurnIndex, turns]);

  return (
    <AgentLogs
      events={displayEvents}
      agents={dag?.nodes ?? []}
      subagentMeta={subagentMeta ?? undefined}
      selectedAgent={selectedAgent}
      toolFilter={toolFilter}
      onSelectAgent={onSelectAgent ?? (() => {})}
    />
  );
}

export const AgentLogTab = memo(AgentLogTabInner);
