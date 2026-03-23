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
    <div className="panel sidebar" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Panel header */}
      <div
        className="panel-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-2)",
        }}
      >
        <div
          className="panel-title"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-2)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          Repositories
        </div>
        <div className="panel-actions" style={{ display: "flex", gap: "2px" }}>
          {(["active", "archived", "all"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              style={{
                padding: "2px 6px",
                fontSize: "9px",
                fontWeight: filterMode === mode ? 600 : 400,
                color: filterMode === mode ? "var(--accent)" : "var(--text-2)",
                background: filterMode === mode ? "var(--accent-dim)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.3px",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div
        className="panel-body"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 0 }}
      >
        {loading ? (
          <p style={{ color: "var(--text-2)", fontSize: "12px", padding: "12px" }}>
            Loading...
          </p>
        ) : filteredRepos.length === 0 ? (
          <p style={{ color: "var(--text-2)", fontSize: "12px", padding: "12px" }}>
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
                  className={`repo-item${isActiveRepo ? " active" : ""}`}
                  style={{
                    padding: "8px 12px 8px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    transition: "all .1s",
                    borderLeft: isActiveRepo
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    background: isActiveRepo ? "var(--accent-dim)" : "transparent",
                  }}
                  onClick={() => toggleExpand(repo.cwd)}
                >
                  <span
                    className="repo-status"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: repo.hasActiveSessions
                        ? "var(--green)"
                        : "var(--yellow)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="repo-name"
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--text-0)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {repo.repoName}
                    </div>
                    <div
                      className="repo-meta"
                      style={{
                        fontSize: "10px",
                        color: "var(--text-2)",
                        marginTop: "1px",
                        display: "flex",
                        gap: "8px",
                      }}
                    >
                      {branches.length === 1 && (
                        <span style={{ color: "var(--cyan)" }}>
                          {branches[0]}
                        </span>
                      )}
                      {branches.length > 1 && (
                        <span style={{ color: "var(--cyan)" }}>
                          {branches.length} branches
                        </span>
                      )}
                      <span>{repo.sessions.length} sessions</span>
                    </div>
                  </div>
                  <span style={{ color: "var(--text-2)", fontSize: "10px", flexShrink: 0 }}>
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
      className={`session-item${isSelected ? " active" : ""}`}
      style={{
        padding: "6px 12px 6px 24px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        transition: "all .1s",
        borderLeft: isSelected
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        background: isSelected ? "var(--accent-dim)" : "transparent",
      }}
      onClick={onSelect}
    >
      {session.isRunning && (
        <span
          style={{
            fontSize: "8px",
            fontWeight: 700,
            padding: "1px 4px",
            borderRadius: "3px",
            background: "var(--green)",
            color: "var(--bg-1)",
            letterSpacing: "0.5px",
            flexShrink: 0,
            animation: "pulse-opacity 2s ease-in-out infinite",
          }}
        >
          LIVE
        </span>
      )}
      <span
        className="session-hash"
        style={{
          fontFamily: "var(--font)",
          fontSize: "11px",
          color: session.isRunning ? "var(--text-0)" : "var(--purple)",
          fontWeight: session.isRunning ? 600 : 400,
        }}
      >
        {displayName}
      </span>
      {session.gitBranch && (
        <span
          style={{
            fontSize: "9px",
            color: "var(--cyan)",
          }}
        >
          {session.gitBranch}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          className="session-detail"
          style={{ fontSize: "10px", color: "var(--text-2)" }}
        >
          {session.eventCount} events
        </span>
      </div>
      {session.subagentCount > 0 && (
        <span
          className="session-agents"
          style={{
            fontSize: "9px",
            padding: "1px 5px",
            borderRadius: "8px",
            background: "var(--bg-4)",
            color: "var(--text-1)",
          }}
        >
          {session.subagentCount}a
        </span>
      )}
      <span
        className="session-time"
        style={{ fontSize: "10px", color: "var(--text-2)", flexShrink: 0 }}
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
