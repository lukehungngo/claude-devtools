import type { SessionInfo } from "../lib/types";

interface Props {
  sessions: SessionInfo[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
}

export function SessionSelector({ sessions, loading, selected, onSelect }: Props) {
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-white mb-4">Claude DevTools</h1>
      <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
        Sessions
      </h2>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions found</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => {
            const isActive =
              selected?.projectHash === s.projectHash &&
              selected?.sessionId === s.id;
            return (
              <li key={`${s.projectHash}/${s.id}`}>
                <button
                  onClick={() =>
                    onSelect({ projectHash: s.projectHash, sessionId: s.id })
                  }
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <div className="font-mono text-xs truncate">
                    {s.id.slice(0, 8)}...
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.eventCount} events · {s.subagentCount} agents
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(s.lastModified).toLocaleString()}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
