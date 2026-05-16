import { useState, useMemo, useEffect, useCallback } from "react";
import { Play, Settings, Copy, Check, LayoutList, RefreshCw, Trash2, Radio } from "lucide-react";
import type { RepoGroup, SessionInfo } from "../lib/types";
import { SourceBadge } from "./SourceBadge";
import { PurgeConfirmModal } from "./PurgeConfirmModal";

const SESSION_NAMES_KEY = "session-names";
const REPO_FILTER_KEY = "repo-filter";

type RepoFilter = "all" | "active";

function loadRepoFilter(): RepoFilter {
  try {
    const raw = localStorage.getItem(REPO_FILTER_KEY);
    return raw === "active" ? "active" : "all";
  } catch {
    return "all";
  }
}

function saveRepoFilter(filter: RepoFilter): void {
  try {
    localStorage.setItem(REPO_FILTER_KEY, filter);
  } catch {
    // ignore
  }
}

function loadSessionNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_NAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveSessionName(sessionId: string, name: string): void {
  const names = loadSessionNames();
  names[sessionId] = name;
  localStorage.setItem(SESSION_NAMES_KEY, JSON.stringify(names));
}

interface SessionDotState {
  background: string;
  animation: string;
  title: string;
}

/**
 * Resolve the session-row status dot from daemon state, falling back to the
 * mtime-derived `isRunning` heuristic when no daemon entry is present.
 *
 * Priority:
 * 1. daemon alive + busy   → pulsing green ("Claude is working")
 * 2. daemon alive + idle   → steady green  ("daemon authoritatively idle")
 * 3. daemon present but stale (alive=false) → amber dot (stale entry)
 * 4. no daemon info        → mtime fallback (green if isRunning, gray otherwise)
 */
export function resolveSessionDotState(session: SessionInfo): SessionDotState {
  const hasDaemonEntry = session.daemonStatus !== undefined || session.pid !== undefined;
  if (hasDaemonEntry && session.daemonAlive === false) {
    return {
      background: "var(--amb)",
      animation: "none",
      title: "Daemon process is no longer running (stale entry)",
    };
  }
  if (hasDaemonEntry && session.daemonAlive) {
    if (session.daemonStatus === "busy") {
      return {
        background: "var(--grn)",
        animation: "pulse 1.5s infinite",
        title: "Daemon status: busy (Claude is working)",
      };
    }
    if (session.daemonStatus === "idle") {
      return {
        background: "var(--grn)",
        animation: "none",
        title: "Daemon status: idle (waiting for input)",
      };
    }
    return {
      background: "var(--grn)",
      animation: "none",
      title: `Daemon status: ${session.daemonStatus ?? "unknown"}`,
    };
  }
  // Fallback: mtime heuristic via isRunning
  return {
    background: session.isRunning ? "var(--grn)" : "var(--t3)",
    animation: "none",
    title: session.isRunning ? "Recently active (mtime heuristic)" : "Idle",
  };
}

interface Props {
  repos: RepoGroup[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
  activeSessionId?: string | null;
  onResumeSession?: (sessionId: string, cwd: string) => void;
  onAddRepo?: (path: string) => void;
  onToggleTurnHistory?: () => void;
  onRefresh?: () => void;
}

export function RepoList({
  repos,
  loading,
  selected,
  onSelect,
  activeSessionId,
  onResumeSession,
  onToggleTurnHistory,
  onRefresh,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionNames] = useState<Record<string, string>>(() => loadSessionNames());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState<RepoFilter>(() => loadRepoFilter());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<{ hash: string; name: string } | null>(null);

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 600);
  }, [onRefresh]);

  const handleSetFilter = useCallback((filter: RepoFilter) => {
    setRepoFilter(filter);
    saveRepoFilter(filter);
  }, []);

  const sortedRepos = useMemo(() => {
    const mapped = repos.map((repo) => {
      const sessions = repoFilter === "active"
        ? repo.sessions.filter((s) => s.isRunning)
        : [...repo.sessions];
      sessions.sort((a, b) => {
        if (a.isRunning && !b.isRunning) return -1;
        if (!a.isRunning && b.isRunning) return 1;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      });
      return { ...repo, sessions };
    });
    return repoFilter === "active"
      ? mapped.filter((repo) => repo.sessions.length > 0)
      : mapped;
  }, [repos, repoFilter]);

  const toggleExpand = useCallback((cwd: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  }, []);

  // Auto-expand repos with selected session
  useEffect(() => {
    if (!selected) return;
    const repo = repos.find((r) =>
      r.sessions.some((s) => s.projectHash === selected.projectHash && s.id === selected.sessionId)
    );
    if (repo && !expanded.has(repo.cwd)) {
      setExpanded((prev) => new Set(prev).add(repo.cwd));
    }
  }, [selected, repos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* REPOS header */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid var(--bd)",
          gap: 6,
        }}
      >
        <span className="t-section flex-1">REPOS</span>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center cursor-pointer border-none bg-transparent disabled:cursor-not-allowed"
            style={{
              width: 20, height: 20, borderRadius: 4,
              color: isRefreshing ? "var(--acc)" : "var(--t3)",
              transition: "color .15s",
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing) (e.currentTarget as HTMLElement).style.color = "var(--t1)";
            }}
            onMouseLeave={(e) => {
              if (!isRefreshing) (e.currentTarget as HTMLElement).style.color = "var(--t3)";
            }}
            title="Refresh repos"
            aria-label="Refresh repos"
          >
            <RefreshCw
              size={12}
              style={{
                animation: isRefreshing ? "spin 0.6s linear" : "none",
                transformOrigin: "center",
              }}
            />
          </button>
        )}
        {onToggleTurnHistory && (
          <button
            onClick={onToggleTurnHistory}
            className="flex items-center justify-center cursor-pointer border-none bg-transparent"
            style={{
              width: 20, height: 20, borderRadius: 4,
              color: "var(--t3)", transition: "color .15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
            title="Toggle turn history panel"
            aria-label="Toggle turn history panel"
          >
            <LayoutList size={12} />
          </button>
        )}
      </div>
      {/* Filter toggle */}
      <div
        className="flex items-center gap-[4px] shrink-0"
        style={{
          padding: "6px 14px",
          borderBottom: "1px solid var(--bd)",
        }}
        role="tablist"
        aria-label="Repo filter"
      >
        {(["all", "active"] as const).map((value) => {
          const isActive = repoFilter === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`repo-filter-${value}`}
              onClick={() => handleSetFilter(value)}
              className="cursor-pointer"
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                border: `1px solid ${isActive ? "var(--acc)" : "var(--bd)"}`,
                background: isActive ? "var(--acc-bg)" : "transparent",
                color: isActive ? "var(--acc)" : "var(--t3)",
                transition: "color .15s, background .15s, border-color .15s",
              }}
            >
              {value === "all" ? "All" : "Active Only"}
            </button>
          );
        })}
      </div>
      {/* Repositories */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden dt-scrollbar">
        {loading ? (
          <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--t3)" }}>Loading...</p>
        ) : sortedRepos.length === 0 ? (
          <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--t3)" }}>
            {repos.length === 0
              ? "No sessions found"
              : "No active repos"}
          </p>
        ) : (
          sortedRepos.map((repo) => {
            const isExpanded = expanded.has(repo.cwd);
            const isActiveRepo =
              selected !== null &&
              repo.sessions.some(
                (s) => s.projectHash === selected.projectHash && s.id === selected.sessionId,
              );

            return (
              <div key={repo.cwd}>
                {/* Repo item */}
                <div
                  className="group flex items-center gap-[7px] cursor-pointer"
                  onClick={() => toggleExpand(repo.cwd)}
                  style={{
                    padding: "8px 14px",
                    borderLeft: `2px solid ${isActiveRepo ? "var(--acc)" : "transparent"}`,
                    transition: "background .12s",
                  }}
                >
                  <span
                    className={isExpanded ? "rotate-90" : ""}
                    style={{
                      fontSize: 9,
                      color: "var(--t3)",
                      width: 12,
                      textAlign: "center",
                      flexShrink: 0,
                      transition: "transform .15s",
                      display: "inline-block",
                    }}
                  >
                    &#9656;
                  </span>
                  <div
                    className="dot"
                    style={{
                      width: 6,
                      height: 6,
                      background: repo.hasActiveSessions ? "var(--grn)" : "var(--t3)",
                    }}
                  />
                  <div className="flex-1 overflow-hidden">
                    <div
                      className="truncate"
                      style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}
                    >
                      {repo.repoName}
                    </div>
                    <div className="font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
                      {repo.gitBranch || "main"}
                    </div>
                  </div>
                  {repo.sessions[0]?.projectHash && (
                    <button
                      data-testid="purge-project-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const hash = repo.sessions[0].projectHash;
                        setPurgeTarget({ hash, name: repo.repoName });
                      }}
                      className="cursor-pointer border-none bg-transparent shrink-0 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                      style={{
                        padding: "2px 4px",
                        color: "var(--t3)",
                        transition: "color .15s, opacity .15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
                      title={`Purge ${repo.repoName} (claude project purge)`}
                      aria-label={`Purge ${repo.repoName}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>

                {/* Session list */}
                <div
                  style={{
                    overflow: "hidden",
                    maxHeight: isExpanded ? 400 : 0,
                    transition: "max-height .25s ease",
                  }}
                >
                  {repo.sessions.map((session) => {
                    const isSelected =
                      selected?.projectHash === session.projectHash &&
                      selected?.sessionId === session.id;
                    const displayName =
                      sessionNames[session.id] ||
                      session.sessionName ||
                      session.id.slice(0, 8);
                    const dotState = resolveSessionDotState(session);

                    return (
                      <div
                        key={`${session.projectHash}/${session.id}`}
                        className="group flex items-center gap-[6px] cursor-pointer"
                        onClick={() =>
                          onSelect({ projectHash: session.projectHash, sessionId: session.id })
                        }
                        style={{
                          padding: "5px 14px 5px 36px",
                          borderLeft: `2px solid ${isSelected ? "var(--acc)" : "transparent"}`,
                          background: isSelected ? "var(--acc-bg)" : "transparent",
                          transition: "background .12s",
                        }}
                      >
                        <div
                          className="dot"
                          title={dotState.title}
                          style={{
                            width: 5,
                            height: 5,
                            background: dotState.background,
                            animation: dotState.animation,
                          }}
                        />
                        <span
                          className="font-mono flex-1 truncate"
                          style={{ fontSize: 10, color: "var(--t2)" }}
                          title={session.id}
                        >
                          {displayName}
                        </span>
                        <SourceBadge source={session.source} />
                        {session.entrypoint && session.entrypoint !== "cli" ? (
                          <span
                            data-testid="entrypoint-badge"
                            className="font-mono shrink-0"
                            title={`Entrypoint: ${session.entrypoint}${session.entrypoint === "sdk-cli" ? " (background or SDK-launched)" : ""}`}
                            style={{
                              fontSize: 9,
                              padding: "0px 4px",
                              borderRadius: 2,
                              color: session.entrypoint === "sdk-cli" ? "var(--purple)" : "var(--t3)",
                              background: session.entrypoint === "sdk-cli" ? "var(--purple-dim)" : "var(--bg-h)",
                            }}
                          >
                            {session.entrypoint === "sdk-cli" ? "bg" : session.entrypoint === "claude-desktop" ? "desk" : session.entrypoint}
                          </span>
                        ) : null}
                        {session.bridgeSessionId ? (
                          <span
                            data-testid="bridge-indicator"
                            className="shrink-0 flex items-center"
                            title="Connected via Remote Control / claude.ai"
                            style={{ color: "var(--cyan)" }}
                          >
                            <Radio size={9} />
                          </span>
                        ) : null}
                        <button
                          data-testid="copy-session-id"
                          data-session-id={session.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(session.id);
                            setCopiedId(session.id);
                            setTimeout(() => setCopiedId((prev) => prev === session.id ? null : prev), 1500);
                          }}
                          className="cursor-pointer border-none bg-transparent shrink-0 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                          style={{
                            padding: "1px 4px",
                            color: copiedId === session.id ? "var(--grn)" : "var(--t3)",
                            position: "relative",
                            zIndex: 1,
                            transition: "color .15s",
                          }}
                          title={`Copy full ID: ${session.id}`}
                        >
                          {copiedId === session.id ? <Check size={9} /> : <Copy size={9} />}
                        </button>
                        <span
                          className="font-mono"
                          style={{ fontSize: 10, color: "var(--amb)" }}
                        >
                          {session.eventCount > 0 ? `${session.eventCount}e` : ""}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: 9, color: "var(--t3)" }}
                        >
                          {getTimeAgo(session.lastModified)}
                        </span>
                        {onResumeSession && !session.isRunning && session.cwd && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onResumeSession(session.id, session.cwd!);
                            }}
                            className="cursor-pointer border-none bg-transparent shrink-0 opacity-0 hover:opacity-100"
                            style={{
                              padding: "1px 4px",
                              fontSize: 9,
                              color: "var(--acc)",
                              transition: "opacity .15s",
                            }}
                            title={`Resume ${displayName}`}
                          >
                            <Play size={9} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-[6px] cursor-pointer shrink-0"
        style={{
          marginTop: "auto",
          padding: "10px 14px",
          borderTop: "1px solid var(--bd)",
          fontSize: 11,
          color: "var(--t3)",
        }}
      >
        <Settings size={12} />
        Settings
      </div>

      {purgeTarget && (
        <PurgeConfirmModal
          projectHash={purgeTarget.hash}
          projectName={purgeTarget.name}
          onClose={() => setPurgeTarget(null)}
          onPurged={() => {
            setPurgeTarget(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
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
