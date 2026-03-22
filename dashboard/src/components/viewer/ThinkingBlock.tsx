import type { ThinkingContent } from "../../lib/types";

interface ThinkingBlockProps {
  content: ThinkingContent;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  if (!content.thinking) return null;

  return (
    <div
      style={{
        color: "var(--purple)",
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
      }}
    >
      {content.thinking}
    </div>
  );
}
