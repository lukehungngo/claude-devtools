import { useEffect, useRef } from "react";
import type { AgentLogEntry, AgentNode } from "../lib/types";

const eventColors: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  assistant:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  progress:
    "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
  "queue-operation":
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

interface Props {
  logs: AgentLogEntry[];
  loading: boolean;
  agents: AgentNode[];
  selectedAgent: string;
  onSelectAgent: (id: string) => void;
}

export function AgentLogs({
  logs,
  loading,
  agents,
  selectedAgent,
  onSelectAgent,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      {/* Agent selector */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-800">
        <select
          value={selectedAgent}
          onChange={(e) => onSelectAgent(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.type === "main" ? "Main Agent" : `${a.type}: ${a.description || a.id}`}
              {a.status === "active" ? " (active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Logs */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-gray-500 text-xs p-2">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-gray-500 text-xs p-2">No events</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.uuid}
              className="p-1.5 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-gray-400 font-mono text-[10px]">
                  {formatTime(log.timestamp)}
                </span>
                <span
                  className={`px-1 py-0.5 rounded text-[10px] font-medium ${eventColors[log.eventType] || eventColors.progress}`}
                >
                  {log.eventType}
                </span>
              </div>
              <div className="text-gray-600 dark:text-gray-400 break-words leading-tight">
                {log.contentPreview || "-"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}
