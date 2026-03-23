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
      <div key={i} style={{ color, fontFamily: "var(--font)", fontSize: "11px" }}>
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
        style={{
          margin: "4px 0",
          paddingLeft: "8px",
          cursor: "pointer",
          transition: "opacity 0.15s ease",
        }}
        onClick={() => setExpanded(true)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "6px",
            fontSize: "11px",
            color: "var(--text-1)",
            fontFamily: "var(--font)",
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: "var(--cyan)", userSelect: "none" }}>{"\u23FA"}</span>
          <span style={{ color: "var(--orange)", fontWeight: 600 }}>{toolName}</span>
          {argsSummary && (
            <span style={{ color: "var(--text-2)", fontSize: "10px" }}>
              ({argsSummary.length > 40 ? argsSummary.slice(0, 40) + "..." : argsSummary})
            </span>
          )}
          {hasOutput && (
            <>
              <span style={{ color: "var(--text-2)", userSelect: "none" }}>{"\u23BF"}</span>
              <span style={{ color: "var(--text-2)", fontSize: "10px" }}>
                {firstOutputLine.trim().length > 50
                  ? firstOutputLine.trim().slice(0, 50) + "..."
                  : firstOutputLine.trim()}
                {outputLineCount > 1 && ` +${outputLineCount - 1} lines`}
              </span>
            </>
          )}
          {hasError && (
            <span style={{ color: "var(--red)", fontSize: "10px" }}>error</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "4px 0",
      borderLeft: `2px solid var(--cyan)`,
      paddingLeft: "8px",
      transition: "opacity 0.15s ease",
    }}>
      {/* Tool header line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11px",
          color: "var(--text-1)",
          cursor: hasOutput ? "pointer" : "default",
        }}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span style={{ color: "var(--cyan)", userSelect: "none" }}>{"\u26A1"}</span>
        <span style={{ color: "var(--orange)", fontWeight: 600 }}>
          {toolName}
        </span>
        {filePath && (
          <span
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--bg-4)",
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "10px",
              color: "var(--cyan)",
              cursor: "pointer",
              textDecoration: "none",
              transition: "text-decoration 0.1s",
            }}
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
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>
            {command.length > 80 ? command.slice(0, 80) + "..." : command}
          </span>
        )}
        {hasOutput && (
          <span style={{ color: "var(--text-2)", fontSize: "10px", marginLeft: "auto" }}>
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
        {hasError && (
          <span style={{ color: "var(--red)", fontSize: "10px" }}>error</span>
        )}
      </div>

      {/* Collapsible output block */}
      {expanded && hasOutput && (
        <div
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            margin: "4px 0 6px 0",
            fontSize: "11px",
            fontFamily: "var(--font)",
            maxHeight: "300px",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
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
