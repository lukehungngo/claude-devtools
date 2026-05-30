import { useMemo } from "react";
import { FolderGit2 } from "lucide-react";
import type { RepoGroup, SessionInfo } from "../../lib/types";
import { Combobox } from "./Combobox";

export interface SessionPickerProps {
  repos: RepoGroup[];
  value: { projectHash: string; sessionId: string } | null;
  onChange: (sel: { projectHash: string; sessionId: string }) => void;
}

function encodeValue(projectHash: string, sessionId: string): string {
  return `${projectHash}::${sessionId}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Short, relative "x ago" label from an ISO start time. */
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function startMs(s: SessionInfo): number {
  const t = new Date(s.startTime).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Active-first, then most-recently-started. */
function pickBestSession(repo: RepoGroup): SessionInfo | null {
  if (repo.sessions.length === 0) return null;
  const active = repo.sessions.filter((s) => s.isActive);
  const pool = active.length > 0 ? active : repo.sessions;
  return pool.reduce((acc, s) => (startMs(s) > startMs(acc) ? s : acc), pool[0]);
}

/** Live (green, pulsing) vs idle (muted) status dot. */
function StatusDot({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "shrink-0 w-2 h-2 rounded-full",
        active ? "bg-dt-green animate-pulse-opacity motion-reduce:animate-none" : "bg-dt-text2/50",
      ].join(" ")}
    />
  );
}

interface Selected {
  repo: RepoGroup;
  session: SessionInfo;
}

function findSelected(
  repos: RepoGroup[],
  value: { projectHash: string; sessionId: string } | null,
): Selected | null {
  if (!value) return null;
  for (const repo of repos) {
    const session = repo.sessions.find(
      (s) => s.projectHash === value.projectHash && s.id === value.sessionId,
    );
    if (session) return { repo, session };
  }
  return null;
}

/**
 * Two-step repo → session picker. Pick a repo (left), then a session within
 * just that repo (right). Picking a repo auto-selects its most-recent
 * (active-first) session so `value` is always valid. Both controls are
 * hardened, accessible comboboxes (filter, keyboard nav, aria) via Combobox.
 */
export function SessionPicker({ repos, value, onChange }: SessionPickerProps) {
  const selected = findSelected(repos, value);

  // The repo whose sessions are shown: the selected session's repo, else the
  // first repo. (Picking a repo updates `value`, so this stays in sync.)
  const currentRepo: RepoGroup | null = selected?.repo ?? repos[0] ?? null;

  const sessions = currentRepo?.sessions ?? [];

  const selectRepo = (repo: RepoGroup) => {
    const best = pickBestSession(repo);
    if (best) onChange({ projectHash: best.projectHash, sessionId: best.id });
  };

  const selectSession = (s: SessionInfo) => {
    onChange({ projectHash: s.projectHash, sessionId: s.id });
  };

  const repoFilterText = useMemo(() => (r: RepoGroup) => r.repoName, []);
  const sessionFilterText = useMemo(() => (s: SessionInfo) => s.id, []);

  return (
    <div className="flex items-center gap-2" data-testid="session-picker">
      {/* Step 1 — repo */}
      <Combobox<RepoGroup>
        testId="repo-picker"
        items={repos}
        getKey={(r) => r.cwd}
        getFilterText={repoFilterText}
        selectedKey={currentRepo?.cwd ?? null}
        onSelect={selectRepo}
        ariaLabel="Select repository"
        placeholder="Filter repos…"
        widthClass="w-52"
        trigger={
          currentRepo ? (
            <>
              <FolderGit2 size={13} className="shrink-0 text-dt-text2" aria-hidden="true" />
              <span className="font-sans font-semibold text-dt-text0 truncate" title={currentRepo.repoName}>
                {currentRepo.repoName}
              </span>
              {currentRepo.hasActiveSessions && <StatusDot active />}
            </>
          ) : (
            <span className="text-dt-text2">No repos</span>
          )
        }
        renderOption={(r) => (
          <>
            <FolderGit2 size={13} className="shrink-0 text-dt-text2" aria-hidden="true" />
            <span className="font-sans font-semibold text-dt-text0 truncate" title={r.repoName}>
              {r.repoName}
            </span>
            {r.hasActiveSessions && <StatusDot active />}
            <span className="ml-auto shrink-0 text-sm font-mono tabular-nums text-dt-text2">
              {r.sessions.length}
            </span>
          </>
        )}
      />

      <span className="text-dt-text2 shrink-0" aria-hidden="true">/</span>

      {/* Step 2 — session within the repo */}
      <Combobox<SessionInfo>
        testId="session-picker"
        items={sessions}
        getKey={(s) => encodeValue(s.projectHash, s.id)}
        getFilterText={sessionFilterText}
        selectedKey={selected ? encodeValue(selected.session.projectHash, selected.session.id) : null}
        onSelect={selectSession}
        ariaLabel="Select session"
        placeholder="Filter by session id…"
        widthClass="w-60"
        disabled={!currentRepo || sessions.length === 0}
        trigger={
          selected ? (
            <>
              <StatusDot active={selected.session.isActive} />
              <span className="font-mono text-dt-text1 truncate" title={selected.session.id}>
                {shortId(selected.session.id)}
              </span>
              <span className="ml-auto shrink-0 text-sm font-mono text-dt-text2">
                {selected.session.isActive ? "live" : relativeTime(selected.session.startTime)}
              </span>
            </>
          ) : (
            <span className="text-dt-text2">Select a session…</span>
          )
        }
        renderOption={(s) => (
          <>
            <StatusDot active={s.isActive} />
            <span className="font-mono text-md text-dt-text0 shrink-0" title={s.id}>
              {shortId(s.id)}
            </span>
            {s.isActive && (
              <span className="text-2xs font-semibold uppercase tracking-[0.4px] text-dt-green">live</span>
            )}
            <span className="ml-auto shrink-0 flex items-center gap-2 text-sm font-mono text-dt-text2">
              {s.subagentCount > 0 && (
                <span title={`${s.subagentCount} subagents`} className="tabular-nums">
                  {s.subagentCount} ag
                </span>
              )}
              <span>{relativeTime(s.startTime)}</span>
            </span>
          </>
        )}
      />
    </div>
  );
}
