import { useState } from "react";
import type { ToolUseContent, ToolResultContent } from "../../lib/types";

interface ToolCallBlockProps {
  toolUse: ToolUseContent;
  toolResult?: ToolResultContent;
}

function extractFilePath(toolUse: ToolUseContent): string | null {
  const input = toolUse.input || {};
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.path === "string") return input.path;
  if (typeof input.pattern === "string") return input.pattern;
  return null;
}

function extractCommand(toolUse: ToolUseContent): string | null {
  const input = toolUse.input || {};
  if (typeof input.command === "string") return input.command;
  return null;
}

function formatToolOutput(
  toolUse: ToolUseContent,
  toolResult?: ToolResultContent
): { lines: string[]; hasError: boolean } {
  if (!toolResult) return { lines: [], hasError: false };

  const rawContent = toolResult.content;
  const contentStr = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text: string }).text : JSON.stringify(c))).join("\n")
      : rawContent ? String(rawContent) : "";
  const hasError = !!toolResult.is_error;
  const lines = contentStr.split("\n");

  // For Write tool, summarize
  if ((toolUse.name || "") === "Write" && !hasError) {
    const lineCount = lines.length;
    return {
      lines: [`Created/updated file (${lineCount} lines)`],
      hasError: false,
    };
  }

  return { lines, hasError };
}

function renderEditDiff(lines: string[]) {
  return lines.map((line, i) => {
    const trimmed = line;
    let color = "var(--text-2)";
    if (trimmed.startsWith("+")) color = "var(--green)";
    else if (trimmed.startsWith("-")) color = "var(--red)";

    return (
      <div key={i} className="font-mono text-xs" style={{ color }}>
        {line}
      </div>
    );
  });
}

/** Build a short args summary for the collapsed tool line */
function summarizeArgs(toolUse: ToolUseContent): string {
  const filePath = extractFilePath(toolUse);
  if (filePath) return filePath;
  const command = extractCommand(toolUse);
  if (command) return command.length > 60 ? command.slice(0, 60) + "..." : command;
  const input = toolUse.input || {};
  const keys = Object.keys(input);
  if (keys.length === 0) return "";
  const first = input[keys[0]];
  const s = typeof first === "string" ? first : JSON.stringify(first);
  return s.length > 60 ? s.slice(0, 60) + "..." : s;
}

export function ToolCallBlock({ toolUse, toolResult }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const filePath = extractFilePath(toolUse);
  const command = extractCommand(toolUse);
  const { lines, hasError } = formatToolOutput(toolUse, toolResult);
  const hasOutput = lines.length > 0 && lines.some((l) => l.trim() !== "");
  const toolName = toolUse.name || "";
  const isEdit = toolName === "Edit";
  const isBash = toolName === "Bash";

  // Collapsed summary line
  const firstOutputLine = hasOutput ? lines.find((l) => l.trim() !== "") || "" : "";
  const outputLineCount = lines.filter((l) => l.trim() !== "").length;
  const argsSummary = summarizeArgs(toolUse);

  if (!expanded) {
    return (
      <div
        className="my-1 pl-2 cursor-pointer transition-opacity"
        onClick={() => setExpanded(true)}
      >
        <div
          className="flex items-baseline gap-1.5 text-xs text-dt-text1 font-mono leading-[1.6]"
        >
          <span className="text-dt-cyan select-none">{"\u23FA"}</span>
          <span className="text-dt-orange font-semibold">{toolName}</span>
          {argsSummary && (
            <span className="text-dt-text2 text-xxs">
              ({argsSummary.length > 40 ? argsSummary.slice(0, 40) + "..." : argsSummary})
            </span>
          )}
          {hasOutput && (
            <>
              <span className="text-dt-text2 select-none">{"\u23BF"}</span>
              <span className="text-dt-text2 text-xxs">
                {firstOutputLine.trim().length > 50
                  ? firstOutputLine.trim().slice(0, 50) + "..."
                  : firstOutputLine.trim()}
                {outputLineCount > 1 && ` +${outputLineCount - 1} lines`}
              </span>
            </>
          )}
          {hasError && (
            <span className="text-dt-red text-xxs">error</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="my-1 border-l-2 border-dt-cyan pl-2 transition-opacity">
      {/* Tool header line */}
      <div
        className={`flex items-center gap-1.5 text-xs text-dt-text1 ${hasOutput ? "cursor-pointer" : "cursor-default"}`}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span className="text-dt-cyan select-none">{"\u26A1"}</span>
        <span className="text-dt-orange font-semibold">
          {toolName}
        </span>
        {filePath && (
          <span
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              background: "var(--bg-4)",
              color: "var(--cyan)",
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-dt-xs text-xxs cursor-pointer transition-[text-decoration]"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLSpanElement).style.textDecoration = "underline";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLSpanElement).style.textDecoration = "none";
            }}
            title={`Click to open: ${filePath}`}
          >
            {filePath}
          </span>
        )}
        {isBash && command && (
          <span className="text-dt-text1 font-semibold">
            {command.length > 80 ? command.slice(0, 80) + "..." : command}
          </span>
        )}
        {hasOutput && (
          <span className="text-dt-text2 text-xxs ml-auto">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
        {hasError && (
          <span className="text-dt-red text-xxs">error</span>
        )}
      </div>

      {/* Collapsible output block */}
      {expanded && hasOutput && (
        <div
          className="bg-dt-bg3 border border-dt-border rounded-dt-sm px-2.5 py-2 my-1 mb-1.5 text-xs font-mono max-h-75 overflow-y-auto whitespace-pre-wrap break-words dt-scrollbar"
        >
          {isEdit ? (
            renderEditDiff(lines)
          ) : (
            <div style={{ color: hasError ? "var(--red)" : "var(--text-2)" }}>
              {lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
