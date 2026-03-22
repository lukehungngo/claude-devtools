import { useState } from "react";
import { ChevronRight, ChevronDown, GitBranch, FolderOpen } from "lucide-react";
import type { RepoGroup, SessionInfo } from "../lib/types";

type Filter = "active" | "archived" | "all";

interface Props {
  repos: RepoGroup[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
}

export function RepoList({ repos, loading, selected, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("active");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (cwd: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  const filteredRepos = repos
    .map((repo) => {
      const sessions = repo.sessions.filter((s) => {
        if (filter === "active") return s.isActive;
        if (filter === "archived") return !s.isActive;
        return true;
      });
      return { ...repo, sessions };
    })
    .filter((repo) => {
      if (filter === "active") return repo.hasActiveSessions;
      if (filter === "archived") return !repo.hasActiveSessions || repo.sessions.length > 0;
      return true;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-sm font-bold mb-2">Repositories</h1>
        <div className="flex gap-1">
          {(["active", "archived", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs rounded transition ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="text-gray-500 text-sm p-2">Loading...</p>
        ) : filteredRepos.length === 0 ? (
          <p className="text-gray-500 text-sm p-2">No repositories found</p>
        ) : (
          <ul className="space-y-0.5">
            {filteredRepos.map((repo) => (
              <li key={repo.cwd}>
                <button
                  onClick={() => toggleExpand(repo.cwd)}
                  className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 transition"
                >
                  {expanded.has(repo.cwd) ? (
                    <ChevronDown size={14} className="shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-gray-400" />
                  )}
                  <FolderOpen size={14} className="shrink-0 text-blue-400" />
                  <span className="truncate font-medium">{repo.repoName}</span>
                  {repo.hasActiveSessions && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  )}
                </button>

                {expanded.has(repo.cwd) && (
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {repo.gitBranch && (
                      <div className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-500">
                        <GitBranch size={10} />
                        {repo.gitBranch}
                      </div>
                    )}
                    {repo.sessions.map((session) => (
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
                )}
              </li>
            ))}
          </ul>
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
  const [copied, setCopied] = useState(false);
  const displayName = session.sessionName || session.id.slice(0, 8);
  const fullId = session.sessionName
    ? `${session.sessionName}\nID: ${session.id}\n\nDouble-click to copy`
    : `${session.id}\n\nDouble-click to copy`;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(session.sessionName || session.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      title={fullId}
      className={`group/session w-full text-left px-2 py-1.5 rounded text-xs transition ${
        isSelected
          ? "bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            session.isActive ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <span className={`truncate ${session.sessionName ? "" : "font-mono"} group-hover/session:hidden`}>
          {displayName}
        </span>
        <span className="truncate hidden group-hover/session:inline text-gray-400">
          {copied ? "✓ Copied!" : "Double-click to copy"}
        </span>
        <span className="ml-auto text-gray-500 shrink-0">{timeAgo}</span>
      </div>
      <div className="mt-0.5 text-gray-500 ml-3">
        {session.eventCount} events · {session.subagentCount} agents
      </div>
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}
