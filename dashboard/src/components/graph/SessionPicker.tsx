import { ChevronDown } from "lucide-react";
import type { RepoGroup, SessionInfo } from "../../lib/types";

export interface SessionPickerProps {
  repos: RepoGroup[];
  value: { projectHash: string; sessionId: string } | null;
  onChange: (sel: { projectHash: string; sessionId: string }) => void;
}

/** Encode a (projectHash, sessionId) pair into a single <option> value. */
function encodeValue(projectHash: string, sessionId: string): string {
  return `${projectHash}::${sessionId}`;
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function optionLabel(s: SessionInfo): string {
  const shortId = s.id.slice(0, 8);
  const when = relativeTime(s.startTime);
  return s.isActive ? `● live · ${shortId} · ${when}` : `${shortId} · ${when}`;
}

export function SessionPicker({ repos, value, onChange }: SessionPickerProps) {
  const selectValue = value ? encodeValue(value.projectHash, value.sessionId) : "";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    const sep = raw.indexOf("::");
    if (sep < 0) return;
    const projectHash = raw.slice(0, sep);
    const sessionId = raw.slice(sep + 2);
    onChange({ projectHash, sessionId });
  };

  return (
    <div className="relative inline-flex items-center">
      <select
        data-testid="session-picker-select"
        aria-label="Select session"
        value={selectValue}
        onChange={handleChange}
        className="appearance-none bg-dt-bg2 border border-dt-border rounded-dt pl-3 pr-8 py-1.5 font-mono text-md text-dt-text0 cursor-pointer focus:outline-none focus:border-dt-border-active min-w-[240px]"
      >
        <option value="" disabled>
          Select a session…
        </option>
        {repos.map((repo) => (
          <optgroup key={repo.cwd} label={repo.repoName}>
            {repo.sessions.map((s) => {
              const optValue = encodeValue(s.projectHash, s.id);
              return (
                <option
                  key={optValue}
                  value={optValue}
                  data-testid={`session-option-${optValue}`}
                >
                  {optionLabel(s)}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 text-dt-text2"
        aria-hidden="true"
      />
    </div>
  );
}
