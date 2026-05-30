import { useState } from "react";
import { ScrollText, Workflow as WorkflowIcon } from "lucide-react";
import type { WorkflowSummary } from "../../lib/types";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { WorkflowTable } from "./WorkflowTable";

export interface GraphRightPanelProps {
  projectHash: string;
  sessionId: string;
  agentId: string | null;
  liveEventCount: number;
  live: boolean;
  workflows: WorkflowSummary[];
}

type Tab = "log" | "workflows";

interface TabButtonProps {
  id: Tab;
  active: Tab;
  onClick: (t: Tab) => void;
  icon: typeof ScrollText;
  label: string;
  badge?: number;
}

function TabButton({ id, active, onClick, icon: Icon, label, badge }: TabButtonProps) {
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-testid={`graph-tab-${id}`}
      onClick={() => onClick(id)}
      className={[
        "flex items-center gap-1.5 px-3 py-2 text-md font-medium border-b-2 transition-colors duration-dt-fast -mb-px",
        isActive
          ? "border-dt-accent text-dt-text0"
          : "border-transparent text-dt-text2 hover:text-dt-text1",
      ].join(" ")}
    >
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      {label}
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-dt-accent-dim px-1.5 text-2xs font-mono tabular-nums text-dt-accent">
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * Right panel for the Graph tab: a Log tab (the selected agent's live log) and
 * a Workflows tab (the workflow-table). Defaults to Log; the Workflows tab
 * carries a count badge.
 */
export function GraphRightPanel({
  projectHash,
  sessionId,
  agentId,
  liveEventCount,
  live,
  workflows,
}: GraphRightPanelProps) {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Graph detail" className="flex items-center gap-1 border-b border-dt-border px-2 shrink-0">
        <TabButton id="log" active={tab} onClick={setTab} icon={ScrollText} label="Log" />
        <TabButton id="workflows" active={tab} onClick={setTab} icon={WorkflowIcon} label="Workflows" badge={workflows.length} />
      </div>

      <div className="min-h-0 flex-1">
        {tab === "log" ? (
          <AgentDetailPanel
            projectHash={projectHash}
            sessionId={sessionId}
            agentId={agentId}
            liveEventCount={liveEventCount}
            live={live}
          />
        ) : (
          <WorkflowTable workflows={workflows} />
        )}
      </div>
    </div>
  );
}
