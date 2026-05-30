import { useMemo, useState, useEffect } from "react";
import { useRepos } from "../hooks/useRepos";
import { useGraphSession } from "../hooks/useGraphSession";
import { useResizablePanel } from "../hooks/useResizablePanel";
import { SessionPicker } from "../components/graph/SessionPicker";
import { AgentGraph } from "../components/graph/AgentGraph";
import { GraphSummary } from "../components/graph/GraphSummary";
import { GraphRightPanel } from "../components/graph/GraphRightPanel";
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
  const rail = useResizablePanel("dt-graph-rail-width", 460);

  const defaultSelection = useMemo(() => pickDefaultSession(repos), [repos]);
  const hasSessions = useMemo(() => repos.some((r) => r.sessions.length > 0), [repos]);
  const selectionExists = useMemo(
    () =>
      !!selection &&
      repos.some((r) =>
        r.sessions.some((s) => s.projectHash === selection.projectHash && s.id === selection.sessionId),
      ),
    [repos, selection],
  );

  // Auto-select the default session once repos load, unless the user already
  // picked one explicitly.
  useEffect(() => {
    if (userPicked) return;
    if (!selection && defaultSelection) setSelection(defaultSelection);
  }, [defaultSelection, selection, userPicked]);

  // Stale-selection recovery: if the picked session is no longer present
  // (deleted / expired / discovery refresh dropped it), fall back to the
  // default so the graph never points at a dead session.
  useEffect(() => {
    if (!selection || !hasSessions || selectionExists) return;
    setSelection(defaultSelection);
    setUserPicked(false);
    setSelectedAgentId(null);
  }, [selection, hasSessions, selectionExists, defaultSelection]);

  const { dag, workflows, runningAgentIds, liveEventCount, loading } = useGraphSession(
    selection?.projectHash ?? null,
    selection?.sessionId ?? null,
  );

  const handleSelectSession = (sel: Selection) => {
    setUserPicked(true);
    setSelection(sel);
    setSelectedAgentId(null);
  };

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
        <div className={["flex flex-1 min-h-0", rail.dragging ? "select-none cursor-col-resize" : ""].join(" ")}>
          {/* Graph canvas */}
          <div className="flex-1 min-w-0 relative">
            {loading && !dag ? (
              <div className="flex items-center justify-center h-full text-dt-text2 text-md font-mono">
                Loading…
              </div>
            ) : (
              <>
                <AgentGraph
                  dag={dag ?? { nodes: [], edges: [] }}
                  runningAgentIds={runningAgentIds}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                />
                {dag && dag.nodes.length > 0 && (
                  <GraphSummary dag={dag} runningAgentIds={runningAgentIds} />
                )}
              </>
            )}
          </div>

          {/* Drag handle — resize the right rail (double-click to reset) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            data-testid="graph-rail-resizer"
            onPointerDown={rail.onPointerDown}
            onDoubleClick={rail.reset}
            title="Drag to resize · double-click to reset"
            className={[
              "relative z-10 w-1 shrink-0 cursor-col-resize transition-colors duration-dt-fast",
              rail.dragging ? "bg-dt-accent" : "bg-dt-border hover:bg-dt-accent",
            ].join(" ")}
          >
            {/* Wider invisible hit area + a centered grip line */}
            <span className="absolute inset-y-0 -left-2 -right-2" aria-hidden="true" />
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-dt-text2/40" aria-hidden="true" />
          </div>

          {/* Right rail — Log | Workflows tabs (resizable) */}
          <div
            style={{ width: rail.width }}
            className="shrink-0 min-w-0 border-l border-dt-border bg-dt-bg"
          >
            <GraphRightPanel
              projectHash={selection?.projectHash ?? ""}
              sessionId={selection?.sessionId ?? ""}
              agentId={selectedAgentId}
              liveEventCount={liveEventCount}
              live={selectedAgentId !== null && runningAgentIds.has(selectedAgentId)}
              workflows={workflows}
            />
          </div>
        </div>
      )}
    </div>
  );
}
