import { useState } from "react";

interface DiffBlockProps {
  oldContent: string;
  newContent: string;
  filePath: string;
}

export function DiffBlock({ oldContent, newContent, filePath }: DiffBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const oldLines = oldContent ? oldContent.split("\n") : [];
  const newLines = newContent ? newContent.split("\n") : [];

  return (
    <div className="border-l-2 border-dt-border ml-5 my-0.5" data-testid="diff-block">
      <div className="flex items-center gap-2 px-2 py-0.5">
        <span className="font-mono text-xs text-dt-text2 overflow-hidden text-ellipsis whitespace-nowrap">
          {filePath}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-dt-accent hover:text-dt-text0 bg-transparent border-none cursor-pointer font-mono shrink-0"
        >
          {expanded ? "Hide diff" : "Show diff"}
        </button>
      </div>
      {expanded && (
        <pre className="font-mono text-xs bg-dt-bg3 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words m-0 mx-2 mb-1">
          {oldLines.map((line, i) => (
            <div
              key={`r-${i}`}
              data-testid="diff-removed"
              className="text-dt-red bg-dt-red-dim px-1"
            >
              {`- ${line}`}
            </div>
          ))}
          {newLines.map((line, i) => (
            <div
              key={`a-${i}`}
              data-testid="diff-added"
              className="text-dt-green bg-dt-green-dim px-1"
            >
              {`+ ${line}`}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
