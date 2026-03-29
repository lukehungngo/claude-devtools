import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ToolResultBlock } from "../viewer/ToolResultBlock";
import { DiffBlock } from "../viewer/DiffBlock";
import { extractToolTarget } from "../../lib/streaming-types";
import type { StreamingToolEntry } from "../../lib/streaming-types";

interface StreamingToolCallProps {
  entry: StreamingToolEntry;
}

const STATUS_ICONS: Record<string, { char: string; colorClass: string }> = {
  success: { char: "\u2713", colorClass: "text-dt-green" },
  error: { char: "\u2717", colorClass: "text-dt-red" },
};

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export function StreamingToolCall({ entry }: StreamingToolCallProps): JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  const [resultExpanded, setResultExpanded] = useState(entry.status === "error");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const target = extractToolTarget(entry.name, entry.input);
  const isRunning = entry.status === "running";

  useEffect(() => {
    if (isRunning) {
      const update = () => setElapsed(Date.now() - entry.startedAt);
      update();
      intervalRef.current = setInterval(update, 100);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else if (entry.completedAt) {
      setElapsed(entry.completedAt - entry.startedAt);
    }
  }, [isRunning, entry.startedAt, entry.completedAt]);

  // Auto-expand errors
  useEffect(() => {
    if (entry.status === "error") {
      setResultExpanded(true);
    }
  }, [entry.status]);

  const borderClass = entry.status === "error" ? "border-l-2 border-dt-red" : "";

  return (
    <div className={`py-1 ${borderClass} rounded-dt-sm`} aria-live="polite">
      {/* Header row */}
      <div className="flex items-center gap-2 py-0.75 text-base font-mono">
        {/* Status icon */}
        <span className="w-3.5 text-center shrink-0 text-xxs">
          {isRunning ? (
            <Loader2
              size={12}
              className="animate-spin text-dt-accent"
              data-testid="tool-spinner"
              aria-label="Tool executing"
            />
          ) : (
            <span className={STATUS_ICONS[entry.status]?.colorClass ?? "text-dt-text2"}>
              {STATUS_ICONS[entry.status]?.char ?? "\u25CF"}
            </span>
          )}
        </span>

        {/* Tool name badge */}
        <span className="px-2 py-0.5 rounded-dt-sm bg-dt-orange text-black text-sm font-semibold whitespace-nowrap shrink-0 shadow-dt-sm">
          {entry.name}
        </span>

        {/* Target preview */}
        {target && (
          <span className="text-dt-text2 overflow-hidden text-ellipsis whitespace-nowrap text-sm min-w-0">
            {target}
          </span>
        )}

        {/* Elapsed timer */}
        <span
          data-testid="elapsed-timer"
          className={`text-xs shrink-0 ml-auto tabular-nums ${
            entry.status === "error" ? "text-dt-red" : "text-dt-text2"
          }`}
        >
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Result area */}
      {entry.resultContent != null && (
        <div data-testid="tool-result-area" className="ml-6 mt-1">
          {entry.resultContent != null && !resultExpanded && entry.status === "success" && (
            <button
              onClick={() => setResultExpanded(true)}
              className="text-xs text-dt-text2 cursor-pointer bg-transparent border-none underline"
              aria-label={`Expand tool result for ${entry.name} ${target}`}
            >
              show result
            </button>
          )}
          {resultExpanded && (
            <>
              <ToolResultBlock
                content={entry.resultContent as string | unknown[]}
                isError={entry.resultIsError ?? false}
                toolName={entry.name}
              />
              <button
                onClick={() => setResultExpanded(false)}
                className="text-xs text-dt-text2 cursor-pointer bg-transparent border-none underline mt-0.5"
                aria-label="Collapse tool result"
              >
                hide result
              </button>
            </>
          )}

          {/* Diff view for Edit/Write tools */}
          {entry.name === "Edit" && entry.input && (
            <DiffBlock
              oldContent={String(entry.input.old_string ?? "")}
              newContent={String(entry.input.new_string ?? "")}
              filePath={String(entry.input.file_path ?? "")}
            />
          )}
          {entry.name === "Write" && entry.input && (
            <DiffBlock
              oldContent=""
              newContent={String(entry.input.content ?? "")}
              filePath={String(entry.input.file_path ?? "")}
            />
          )}
        </div>
      )}
    </div>
  );
}
