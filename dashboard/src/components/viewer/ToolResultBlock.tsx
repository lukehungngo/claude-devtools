import { useState } from "react";

interface ToolResultBlockProps {
  content: string | unknown[];
  isError: boolean;
  toolName: string;
}

function stringifyContent(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

const COLLAPSED_LINES = 3;
const TRUNCATE_LINES = 50;

export function ToolResultBlock({ content, isError, toolName }: ToolResultBlockProps) {
  const text = stringifyContent(content);
  const lines = text.split("\n");
  const totalLines = lines.length;
  const isLong = totalLines > 5;

  const [collapsed, setCollapsed] = useState(isLong);
  const [truncated, setTruncated] = useState(totalLines > TRUNCATE_LINES);

  const borderColor = isError ? "border-dt-red" : "border-dt-border";

  let displayText: string;
  if (collapsed) {
    displayText = lines.slice(0, COLLAPSED_LINES).join("\n");
  } else if (truncated) {
    displayText = lines.slice(0, TRUNCATE_LINES).join("\n");
  } else {
    displayText = text;
  }

  const hiddenCount = collapsed ? totalLines - COLLAPSED_LINES : 0;

  return (
    <div
      className={`border-l-2 ${borderColor} ml-5 my-0.5`}
      data-testid={`tool-result-${toolName}`}
    >
      <pre className="font-mono text-xs bg-dt-bg3 rounded-md p-2 overflow-x-auto text-dt-text1 whitespace-pre-wrap break-words m-0">
        {displayText}
      </pre>
      {collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs text-dt-text2 hover:text-dt-accent bg-transparent border-none cursor-pointer px-2 py-0.5 font-mono"
        >
          {hiddenCount} more lines...
        </button>
      )}
      {!collapsed && truncated && (
        <button
          type="button"
          onClick={() => setTruncated(false)}
          className="text-xs text-dt-text2 hover:text-dt-accent bg-transparent border-none cursor-pointer px-2 py-0.5 font-mono"
        >
          Show more ({totalLines - TRUNCATE_LINES} lines hidden)
        </button>
      )}
    </div>
  );
}
