import { useState, useMemo } from "react";
import type { RepoGroup, SessionInfo } from "../lib/types";

type FilterMode = "active" | "archived" | "all";

interface Props {
  repos: RepoGroup[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
}

export function RepoList({ repos, loading, selected, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>("active");

  const filteredRepos = useMemo(() => {
    const filtered = filterMode === "all"
      ? repos
      : repos
          .map((repo) => {
            const filteredSessions = repo.sessions.filter((s) =>
              filterMode === "active" ? s.isActive : !s.isActive
            );
            if (filteredSessions.length === 0) return null;
            return { ...repo, sessions: filteredSessions };
          })
          .filter(Boolean) as RepoGroup[];

    // Sort sessions within each repo: running first, then by lastModified
    return filtered.map((repo) => ({
      ...repo,
      sessions: [...repo.sessions].sort((a, b) => {
        if (a.isRunning && !b.isRunning) return -1;
        if (!a.isRunning && b.isRunning) return 1;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      }),
    }));
  }, [repos, filterMode]);

  const toggleExpand = (cwd: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  return (
    <div className="panel sidebar flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div
        className="panel-header flex items-center justify-between px-3 py-2 border-b border-dt-border shrink-0 bg-dt-bg2"
      >
        <div
          className="panel-title text-base font-semibold uppercase tracking-wide text-dt-text2 flex items-center gap-1.5"
        >
          Repositories
        </div>
        <div className="panel-actions flex gap-0.5">
          {(["active", "archived", "all"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-1.5 py-0.5 text-xs rounded-dt-sm cursor-pointer uppercase tracking-[0.3px] border-none ${
                filterMode === mode
                  ? "font-semibold text-dt-accent bg-dt-accent-dim"
                  : "font-normal text-dt-text2 bg-transparent"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="panel-body flex-1 overflow-y-auto overflow-x-hidden p-0 dt-scrollbar">
        {loading ? (
          <p className="text-dt-text2 text-sm p-3">
            Loading...
          </p>
        ) : filteredRepos.length === 0 ? (
          <p className="text-dt-text2 text-sm p-3">
            {filterMode === "all"
              ? "No repositories found"
              : `No ${filterMode} sessions`}
          </p>
        ) : (
          filteredRepos.map((repo) => {
            const isExpanded = expanded.has(repo.cwd);
            const isActiveRepo =
              selected !== null &&
              repo.sessions.some(
                (s) =>
                  s.projectHash === selected.projectHash &&
                  s.id === selected.sessionId
              );

            // Collect unique branches across sessions in this repo
            const branches = [
              ...new Set(
                repo.sessions.map((s) => s.gitBranch).filter(Boolean)
              ),
            ];

            return (
              <div key={repo.cwd}>
                {/* Repo item */}
                <div
                  className={`repo-item flex items-center gap-2 cursor-pointer transition-all duration-100 py-2 pr-3 pl-4 border-l-2 ${
                    isActiveRepo
                      ? "border-dt-accent bg-dt-accent-dim"
                      : "border-transparent bg-transparent"
                  }`}
                  onClick={() => toggleExpand(repo.cwd)}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      repo.hasActiveSessions ? "bg-dt-green" : "bg-dt-yellow"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-md font-semibold text-dt-text0 truncate"
                    >
                      {repo.repoName}
                    </div>
                    <div
                      className="text-sm text-dt-text2 mt-px flex gap-2"
                    >
                      {branches.length === 1 && (
                        <span className="text-dt-cyan">
                          {branches[0]}
                        </span>
                      )}
                      {branches.length > 1 && (
                        <span className="text-dt-cyan">
                          {branches.length} branches
                        </span>
                      )}
                      <span>{repo.sessions.length} sessions</span>
                    </div>
                  </div>
                  <span className="text-dt-text2 text-xs shrink-0">
                    {isExpanded ? "\u25BC" : "\u25B6"}
                  </span>
                </div>

                {/* Sessions */}
                {isExpanded &&
                  repo.sessions.map((session) => (
                    <SessionItem
                      key={`${session.projectHash}/${session.id}`}
                      session={session}
                      isSelected={
                        selected?.projectHash === session.projectHash &&
                        selected?.sessionId === session.id
                      }
                      onSelect={() =>
                        onSelect({
                          projectHash: session.projectHash,
                          sessionId: session.id,
                        })
                      }
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  onSelect,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const timeAgo = getTimeAgo(session.lastModified);
  const displayName = session.sessionName || session.id.slice(0, 8);

  return (
    <div
      className={`session-item flex items-center gap-2 cursor-pointer transition-all duration-100 py-1.5 pr-3 pl-6 border-l-2 ${
        isSelected
          ? "border-dt-accent bg-dt-accent-dim"
          : "border-transparent bg-transparent"
      }`}
      onClick={onSelect}
    >
      {session.isRunning && (
        <span
          className="text-2xs font-bold px-1 py-px rounded-dt-xs bg-dt-green text-dt-bg1 tracking-[0.5px] shrink-0 animate-pulse-opacity"
        >
          LIVE
        </span>
      )}
      <span
        className={`font-mono text-base ${
          session.isRunning ? "text-dt-text0 font-semibold" : "text-dt-purple font-normal"
        }`}
      >
        {displayName}
      </span>
      {session.gitBranch && (
        <span className="text-xs text-dt-cyan">
          {session.gitBranch}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <span
          className="text-sm text-dt-text2"
        >
          {session.eventCount} events
        </span>
      </div>
      {session.subagentCount > 0 && (
        <span
          className="text-xs px-1.25 py-px rounded-full bg-dt-bg4 text-dt-text1"
        >
          {session.subagentCount}a
        </span>
      )}
      <span
        className="text-sm text-dt-text2 shrink-0"
      >
        {timeAgo}
      </span>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}
