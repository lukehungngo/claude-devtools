import { memo, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { RepoGroup, SessionInfo } from "../../lib/types";

export interface HistoryTabProps {
  repos: RepoGroup[];
  currentSessionId?: string;
}

function formatSessionDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      ", " +
      d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString.slice(0, 16);
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

function HistoryTabInner({ repos, currentSessionId }: HistoryTabProps) {
  const navigate = useNavigate();

  const sortedSessions = useMemo(() => {
    const all: SessionInfo[] = [];
    for (const repo of repos) {
      for (const session of repo.sessions) {
        all.push(session);
      }
    }
    all.sort((a, b) => {
      const ta = new Date(a.lastModified).getTime();
      const tb = new Date(b.lastModified).getTime();
      return tb - ta;
    });
    return all;
  }, [repos]);

  const handleClick = useCallback(
    (session: SessionInfo) => {
      navigate({
        to: "/session/$repoSlug/$sessionId",
        params: { repoSlug: session.projectHash, sessionId: session.id },
      });
    },
    [navigate],
  );

  if (sortedSessions.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100%", color: "var(--t3)", fontSize: 13 }}
      >
        No session history
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {sortedSessions.map((session) => {
        const isCurrent = session.id === currentSessionId;
        return (
          <div
            key={session.id}
            data-testid="history-session-row"
            onClick={() => handleClick(session)}
            style={{
              padding: "8px 12px",
              display: "flex",
              gap: 12,
              fontSize: 11,
              cursor: "pointer",
              borderBottom: "1px solid var(--bd)",
              background: isCurrent ? "var(--bg-s)" : undefined,
              borderLeft: isCurrent ? "2px solid var(--acc)" : "2px solid transparent",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--t3)", width: 100, flexShrink: 0 }}>
              {formatSessionDate(session.lastModified)}
            </span>
            <span
              style={{
                color: "var(--t3)",
                fontFamily: "var(--font-mono)",
                width: 70,
                flexShrink: 0,
              }}
            >
              {session.id.slice(0, 8)}
            </span>
            <span
              style={{
                color: "var(--t2)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncate(session.sessionName ?? session.id, 60)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const HistoryTab = memo(HistoryTabInner);
