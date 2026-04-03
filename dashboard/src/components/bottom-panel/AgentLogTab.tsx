import { memo } from "react";
import type { SessionEvent, AgentDAG, SubagentMeta } from "../../lib/types";
import { AgentLogs } from "../AgentLogs";

export interface AgentLogTabProps {
  allEvents: SessionEvent[];
  dag?: AgentDAG | null;
  subagentMeta?: SubagentMeta | null;
  selectedAgent?: string | null;
  onSelectAgent?: (agentId: string) => void;
  toolFilter?: string | null;
}

function AgentLogTabInner({
  allEvents,
  dag,
  subagentMeta,
  selectedAgent = null,
  onSelectAgent,
  toolFilter = null,
}: AgentLogTabProps) {
  return (
    <AgentLogs
      events={allEvents}
      agents={dag?.nodes ?? []}
      subagentMeta={subagentMeta ?? undefined}
      selectedAgent={selectedAgent}
      toolFilter={toolFilter}
      onSelectAgent={onSelectAgent ?? (() => {})}
    />
  );
}

export const AgentLogTab = memo(AgentLogTabInner);
