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
        className="border-l-2 border-dt-purple pl-2 my-1 cursor-pointer transition-opacity"
      >
        <span className="text-dt-purple text-xs font-semibold font-mono uppercase tracking-wide">Thinking</span>
        <div className="text-dt-text2 italic font-mono text-md leading-[1.6] mt-0.5">
          {text.slice(0, 80)}...{" "}
          <span className="text-dt-text3 text-xs">
            (click to expand)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={isLong ? () => setExpanded(!expanded) : undefined}
      className={`border-l-2 border-dt-purple pl-2 my-1 transition-opacity ${
        isLong ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-dt-purple text-xs font-semibold font-mono uppercase tracking-wide">Thinking</span>
      <div className="text-dt-text2 italic font-mono text-md leading-[1.6] mt-0.5 whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}
