import { useState, useMemo, useEffect, useCallback } from "react";
import { Play, Settings, Copy, Check } from "lucide-react";
import type { RepoGroup } from "../lib/types";

const SESSION_NAMES_KEY = "session-names";

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

interface Props {
  repos: RepoGroup[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
  onNewSession?: () => void;
  activeSessionId?: string | null;
  onResumeSession?: (sessionId: string, cwd: string) => void;
  onAddRepo?: (path: string) => void;
}

export function RepoList({
  repos,
  loading,
  selected,
  onSelect,
  onNewSession,
  activeSessionId,
  onResumeSession,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionNames] = useState<Record<string, string>>(() => loadSessionNames());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sortedRepos = useMemo(() => {
    return repos.map((repo) => ({
      ...repo,
      sessions: [...repo.sessions].sort((a, b) => {
        if (a.isRunning && !b.isRunning) return -1;
        if (!a.isRunning && b.isRunning) return 1;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      }),
    }));
  }, [repos]);

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
      {/* Repositories */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden dt-scrollbar">
        {loading ? (
          <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--t3)" }}>Loading...</p>
        ) : repos.length === 0 ? (
          <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--t3)" }}>No sessions found</p>
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
                  className="flex items-center gap-[7px] cursor-pointer"
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
                          style={{
                            width: 5,
                            height: 5,
                            background: session.isRunning ? "var(--grn)" : "var(--t3)",
                          }}
                        />
                        <span
                          className="font-mono flex-1 truncate"
                          style={{ fontSize: 10, color: "var(--t2)" }}
                          title={session.id}
                        >
                          {displayName}
                        </span>
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
