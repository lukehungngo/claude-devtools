import { useMemo, useState, useEffect } from "react";
import { useRepos } from "../hooks/useRepos";
import { useGraphSession } from "../hooks/useGraphSession";
import { SessionPicker } from "../components/graph/SessionPicker";
import { AgentGraph } from "../components/graph/AgentGraph";
import { AgentDetailPanel } from "../components/graph/AgentDetailPanel";
import type { RepoGroup, SessionInfo } from "../lib/types";

interface Selection {
  projectHash: string;
  sessionId: string;
}

function startMs(s: SessionInfo): number {
  const t = new Date(s.startTime).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Pick a default session: the most-recently-started active session, else the
 * most-recently-started session overall. Returns null when no sessions exist.
 */
function pickDefaultSession(repos: RepoGroup[]): Selection | null {
  const all = repos.flatMap((r) => r.sessions);
  if (all.length === 0) return null;

  const active = all.filter((s) => s.isActive);
  const pool = active.length > 0 ? active : all;
  const best = pool.reduce((acc, s) => (startMs(s) > startMs(acc) ? s : acc), pool[0]);
  return { projectHash: best.projectHash, sessionId: best.id };
}

export function GraphPage() {
  const { repos, loading: reposLoading } = useRepos();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const defaultSelection = useMemo(() => pickDefaultSession(repos), [repos]);

  // Auto-select the default session once repos load, unless the user already
  // picked one explicitly.
  useEffect(() => {
    if (userPicked) return;
    if (!selection && defaultSelection) setSelection(defaultSelection);
  }, [defaultSelection, selection, userPicked]);

  const { dagForTurn, runningAgentIds, liveEventCount, loading } = useGraphSession(
    selection?.projectHash ?? null,
    selection?.sessionId ?? null,
  );

  const handleSelectSession = (sel: Selection) => {
    setUserPicked(true);
    setSelection(sel);
    setSelectedAgentId(null);
  };

  const hasSessions = repos.some((r) => r.sessions.length > 0);

  return (
    <div className="flex flex-col h-full w-full bg-dt-bg1">
      {/* Top bar — session picker */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dt-border shrink-0">
        <span className="text-md font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
          Agent Graph
        </span>
        <SessionPicker repos={repos} value={selection} onChange={handleSelectSession} />
      </div>

      {!hasSessions && !reposLoading ? (
        <div
          data-testid="graph-no-session"
          className="flex items-center justify-center flex-1 text-dt-text2 text-md font-mono"
        >
          No sessions found
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Graph canvas */}
          <div className="flex-1 min-w-0 relative">
            {loading && !dagForTurn ? (
              <div className="flex items-center justify-center h-full text-dt-text2 text-md font-mono">
                Loading…
              </div>
            ) : (
              <AgentGraph
                dag={dagForTurn ?? { nodes: [], edges: [] }}
                runningAgentIds={runningAgentIds}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
              />
            )}
          </div>

          {/* Right rail — agent detail */}
          <div className="w-[22rem] shrink-0 border-l border-dt-border bg-dt-bg">
            <AgentDetailPanel
              projectHash={selection?.projectHash ?? ""}
              sessionId={selection?.sessionId ?? ""}
              agentId={selectedAgentId}
              liveEventCount={liveEventCount}
            />
          </div>
        </div>
      )}
    </div>
  );
}
