import { useState } from "react";

interface StreamingThinkingProps {
  text: string;
  isComplete: boolean;
}

const MAX_COLLAPSED_LINES = 3;

export function StreamingThinking({ text, isComplete }: StreamingThinkingProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const lines = text.split("\n");
  const isLong = lines.length > MAX_COLLAPSED_LINES;
  const displayText = !expanded && isLong
    ? lines.slice(0, MAX_COLLAPSED_LINES).join("\n")
    : text;

  return (
    <div className="border-l-2 border-dt-purple pl-3 py-2 my-1.5 bg-dt-purple-dim rounded-r-dt-sm shadow-dt-sm">
      <p className="text-dt-text2 text-sm italic whitespace-pre-wrap font-mono leading-relaxed">
        {displayText}
        {!isComplete && (
          <span
            data-testid="thinking-cursor"
            className="inline-block w-1.5 h-3.5 bg-dt-purple ml-0.5 animate-pulse align-text-bottom"
          />
        )}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-dt-text2 mt-1 cursor-pointer bg-transparent border-none underline"
          aria-label={expanded ? "Collapse thinking" : "Expand thinking"}
        >
          {expanded ? "collapse" : `${lines.length - MAX_COLLAPSED_LINES} more lines...`}
        </button>
      )}
    </div>
  );
}
