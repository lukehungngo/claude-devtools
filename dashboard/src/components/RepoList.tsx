import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, Play, Settings } from "lucide-react";
import type { RepoGroup, SessionInfo, UsageInfo } from "../lib/types";

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
  usage?: UsageInfo | null;
  isConnected?: boolean;
}

export function RepoList({
  repos,
  loading,
  selected,
  onSelect,
  onNewSession,
  activeSessionId,
  onResumeSession,
  usage,
  isConnected,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionNames] = useState<Record<string, string>>(() => loadSessionNames());

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

  // Usage percentages
  const sessionPct = usage?.fiveHour.utilization ?? null;
  const ratePct = usage?.sevenDay.utilization ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Connection section */}
      <SectionTitle>Connection</SectionTitle>
      <div style={{ padding: "8px 14px" }} className="flex items-center gap-2">
        <div
          className="rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: isConnected ? "var(--grn)" : "var(--red)",
          }}
        />
        <div className="flex-1 overflow-hidden">
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>Claude Code</div>
          <div className="font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
            MCP + logs + hooks
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            padding: "2px 8px",
            borderRadius: 8,
            fontWeight: 500,
            background: isConnected ? "var(--grn-bg)" : "var(--red-bg)",
            color: isConnected ? "var(--grn)" : "var(--red)",
          }}
        >
          {isConnected ? "connected" : "disconnected"}
        </span>
      </div>
      {usage?.planName && (
        <div
          className="flex items-center gap-2"
          style={{ padding: "4px 14px 10px", borderBottom: "1px solid var(--bd)" }}
        >
          <div
            className="rounded-full shrink-0"
            style={{ width: 7, height: 7, background: "var(--grn)" }}
          />
          <div className="flex-1 overflow-hidden">
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>
              {usage.planName}
            </div>
            <div className="font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
              {usage.planName} plan
            </div>
          </div>
          <span
            style={{
              fontSize: 9,
              padding: "2px 8px",
              borderRadius: 8,
              fontWeight: 500,
              background: "var(--acc-bg)",
              color: "var(--acc)",
            }}
          >
            {usage.planName}
          </span>
        </div>
      )}

      {/* Usage section */}
      <SectionTitle>Usage</SectionTitle>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--bd)" }}>
        <UsageRow label="Session limit (5h)" value={sessionPct} resetsAt={usage?.fiveHour.resetsAt} />
        <UsageRow label="Rate limit (7d)" value={ratePct} resetsAt={usage?.sevenDay.resetsAt} />
      </div>

      {/* Repositories section */}
      <SectionTitle>Repositories</SectionTitle>
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
                    className="rounded-full shrink-0"
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
                        className="flex items-center gap-[6px] cursor-pointer"
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
                          className="rounded-full shrink-0"
                          style={{
                            width: 5,
                            height: 5,
                            background: session.isRunning ? "var(--grn)" : "var(--t3)",
                          }}
                        />
                        <span
                          className="font-mono flex-1"
                          style={{ fontSize: 10, color: "var(--t2)" }}
                        >
                          {displayName}
                        </span>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-medium uppercase"
      style={{
        fontSize: 10,
        color: "var(--t3)",
        letterSpacing: ".8px",
        padding: "14px 14px 6px",
      }}
    >
      {children}
    </div>
  );
}

function formatCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (diffMs <= 0) return "resetting...";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diffMs / 3_600_000);
  const remainMins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours < 24) return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
  const days = Math.floor(diffMs / 86_400_000);
  const remainHours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

function UsageRow({
  label,
  value,
  resetsAt,
}: {
  label: string;
  value: number | null;
  resetsAt?: string | null;
}) {
  const pct = value ?? 0;
  const remaining = value != null ? Math.max(0, 100 - pct) : null;
  const barColor =
    pct > 80 ? "var(--red)" : pct > 50 ? "var(--amb)" : "var(--grn)";
  const countdown = formatCountdown(resetsAt ?? null);

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        className="flex justify-between items-baseline"
        style={{ marginBottom: 4 }}
      >
        <span style={{ fontSize: 10, color: "var(--t3)" }}>{label}</span>
        <span
          className="font-mono font-medium flex items-baseline gap-1"
          style={{ fontSize: 11 }}
        >
          {remaining != null ? (
            <>
              <span style={{ color: "var(--t1)" }}>{remaining}%</span>
              <span style={{ fontSize: 9, color: "var(--t3)" }}>left</span>
            </>
          ) : (
            <span style={{ color: "var(--t3)" }}>--</span>
          )}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--bd)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {value != null && (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 2,
              background: barColor,
            }}
          />
        )}
      </div>
      {countdown && (
        <div
          className="font-mono"
          style={{ fontSize: 9, color: "var(--t3)", marginTop: 2 }}
        >
          resets in {countdown}
        </div>
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
