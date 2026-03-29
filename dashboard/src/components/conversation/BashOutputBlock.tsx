import { useState } from "react";
import { Terminal, Check, X } from "lucide-react";

/** Strip ANSI escape codes from command output */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

const COLLAPSED_LINES = 5;
const TRUNCATE_LINES = 50;

interface BashOutputBlockProps {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function BashOutputBlock({ command, stdout, stderr, exitCode }: BashOutputBlockProps) {
  const [expanded, setExpanded] = useState(exitCode !== 0);

  const isError = exitCode !== 0;
  const cleanStdout = stripAnsi(stdout);
  const cleanStderr = stripAnsi(stderr);

  const output = cleanStdout || cleanStderr;
  const outputLines = output ? output.split("\n") : [];
  const hasOutput = output.length > 0;
  const needsCollapse = outputLines.length > COLLAPSED_LINES && !isError;

  const visibleLines = expanded
    ? outputLines
    : needsCollapse
      ? outputLines.slice(0, COLLAPSED_LINES)
      : outputLines;

  const hiddenCount = needsCollapse && !expanded
    ? outputLines.length - COLLAPSED_LINES
    : 0;

  const showTruncateWarning = expanded && outputLines.length > TRUNCATE_LINES;

  const borderClass = isError
    ? "border-l-2 border-l-dt-red"
    : "border-l-2 border-l-dt-border";

  return (
    <div
      role="log"
      className={`rounded-dt-lg border border-dt-border ${borderClass} p-4 my-3 bg-dt-bg2 shadow-dt-sm transition-all duration-dt-normal ease-dt-expo`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-dt-text2 text-xs font-semibold">
          <Terminal className="w-3.5 h-3.5" />
          <span>Bash</span>
        </div>
        <span
          aria-label={`Exit code ${exitCode}, ${isError ? "failure" : "success"}`}
          className={`text-xs font-mono px-2 py-0.5 rounded-dt-sm shadow-dt-sm ${
            isError
              ? "bg-dt-red-dim text-dt-red"
              : "bg-dt-green-dim text-dt-green"
          }`}
        >
          {isError ? <X className="w-3 h-3 inline mr-0.5" /> : <Check className="w-3 h-3 inline mr-0.5" />}
          exit {exitCode}
        </span>
      </div>

      {/* Command echo */}
      <div className="font-mono text-xs text-dt-text2 mb-1.5 overflow-x-auto whitespace-nowrap">
        <span className="sr-only">Command:</span>
        $ {command}
      </div>

      {/* Separator */}
      <div className="border-t border-dt-border mb-1.5" />

      {/* Output area */}
      <div
        tabIndex={0}
        aria-label="Command output"
        className="font-mono text-xs bg-dt-bg3 rounded-dt-sm p-2.5 overflow-x-auto text-dt-text1 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto"
      >
        {!hasOutput ? (
          <span className="italic text-dt-text2">No output</span>
        ) : (
          <>
            <pre className="m-0 font-mono text-xs whitespace-pre-wrap break-words">
              {visibleLines.join("\n")}
            </pre>
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-1 text-dt-accent text-xs cursor-pointer bg-transparent border-none hover:underline"
              >
                {hiddenCount} more lines...
              </button>
            )}
            {showTruncateWarning && outputLines.length > TRUNCATE_LINES && (
              <div className="mt-1 text-dt-text2 text-xs italic">
                Showing all {outputLines.length} lines
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
