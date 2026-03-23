import { useState } from "react";
import type { ThinkingContent } from "../../lib/types";

interface ThinkingBlockProps {
  content: ThinkingContent;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content.thinking) return null;

  const text = content.thinking;
  const isLong = text.length > 80;

  if (!expanded && isLong) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          color: "var(--text-1)",
          fontStyle: "italic",
          opacity: 0.8,
          borderLeft: "2px solid var(--purple)",
          paddingLeft: "8px",
          margin: "4px 0",
          fontFamily: "var(--font)",
          fontSize: "12px",
          lineHeight: 1.6,
          cursor: "pointer",
          transition: "opacity 0.15s ease",
        }}
      >
        {text.slice(0, 80)}...{" "}
        <span style={{ color: "var(--text-2)", fontSize: "10px" }}>
          (click to expand)
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={isLong ? () => setExpanded(!expanded) : undefined}
      style={{
        color: "var(--text-1)",
        fontStyle: "italic",
        opacity: 0.8,
        borderLeft: "2px solid var(--purple)",
        paddingLeft: "8px",
        margin: "4px 0",
        fontFamily: "var(--font)",
        fontSize: "12px",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        cursor: isLong ? "pointer" : "default",
        transition: "opacity 0.15s ease",
      }}
    >
      {text}
    </div>
  );
}
