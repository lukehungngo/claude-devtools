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
        className="text-dt-text1 italic opacity-80 border-l-2 border-dt-purple pl-2 my-1 font-mono text-md leading-[1.6] cursor-pointer transition-opacity"
      >
        {text.slice(0, 80)}...{" "}
        <span className="text-dt-text2 text-xs">
          (click to expand)
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={isLong ? () => setExpanded(!expanded) : undefined}
      className={`text-dt-text1 italic opacity-80 border-l-2 border-dt-purple pl-2 my-1 font-mono text-md leading-[1.6] whitespace-pre-wrap break-words transition-opacity ${
        isLong ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {text}
    </div>
  );
}
