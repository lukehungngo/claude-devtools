import { useAgentLogs } from "../../hooks/useAgentLogs";
import { lastEmittedLines } from "../../lib/lastEmittedLines";

export interface AgentDetailPanelProps {
  projectHash: string;
  sessionId: string;
  agentId: string | null;
  liveEventCount?: number;
}

const MAX_LINES = 5;

export function AgentDetailPanel({
  projectHash,
  sessionId,
  agentId,
  liveEventCount,
}: AgentDetailPanelProps) {
  // Hook is called unconditionally (rules of hooks). When no agent is
  // selected, agentId resolves to "" which short-circuits the fetch in
  // useAgentLogs.
  const { logs, loading } = useAgentLogs(projectHash, sessionId, agentId ?? "", liveEventCount);

  if (agentId === null) {
    return (
      <div
        data-testid="agent-detail-empty"
        className="flex items-center justify-center h-full text-dt-text2 text-md font-mono"
      >
        Select an agent to see its last {MAX_LINES} emitted lines
      </div>
    );
  }

  const lines = lastEmittedLines(logs, MAX_LINES);

  return (
    <div data-testid="agent-detail-panel" className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-dt-border shrink-0">
        <span className="text-md font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
          Agent {agentId === "main" ? "main" : agentId.slice(0, 8)}
        </span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-1.5">
        {loading && lines.length === 0 ? (
          <div className="text-md font-mono text-dt-text2">Loading…</div>
        ) : lines.length === 0 ? (
          <div className="text-md font-mono text-dt-text2">No emitted lines yet</div>
        ) : (
          lines.map((line) => (
            <div
              key={line.uuid}
              data-testid="agent-detail-line"
              className="flex items-start gap-2"
            >
              <span className="shrink-0 px-1.5 py-0.5 rounded-dt-xs bg-dt-bg2 text-3xs font-mono font-semibold uppercase text-dt-text2">
                {line.eventType}
              </span>
              <span className="text-md font-mono text-dt-text1 break-words overflow-hidden">
                {line.contentPreview}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
