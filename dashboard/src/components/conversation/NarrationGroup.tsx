import { useState } from "react";

interface NarrationGroupProps {
  /** Plain text strings from narration (pre-tool-call) text blocks */
  items: string[];
}

/**
 * Collapsible group for narration text — working notes Claude writes before
 * tool calls. Collapsed by default to keep the conversation focused on
 * final responses, similar to how ThinkingGroup handles thinking blocks.
 */
export function NarrationGroup({ items }: NarrationGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const nonEmpty = items.filter((t) => t.trim().length > 0);
  if (nonEmpty.length === 0) return null;

  const totalChars = nonEmpty.reduce((sum, t) => sum + t.length, 0);

  return (
    <div
      className="rounded-lg my-1.5 overflow-hidden"
      style={{ border: "1px solid var(--bd)", background: "var(--bg-s)" }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 cursor-pointer select-none"
        style={{ padding: "6px 10px" }}
      >
        <span
          className="shrink-0 inline-block transition-transform duration-150"
          style={{
            fontSize: 9,
            color: "var(--t3)",
            width: 12,
            textAlign: "center",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9656;
        </span>
        <span
          className="font-mono font-semibold uppercase tracking-wide"
          style={{ fontSize: 10, color: "var(--t3)" }}
        >
          Working
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 10, color: "var(--t3)" }}
        >
          {nonEmpty.length > 1
            ? `${nonEmpty.length} steps \u00b7 ${totalChars} chars`
            : `${totalChars} chars`}
        </span>
      </div>

      {/* Body — collapsed by default */}
      {expanded && (
        <div style={{ padding: "0 10px 8px 24px" }}>
          {nonEmpty.map((text, i) => (
            <div
              key={i}
              className="border-l-2 border-dt-border pl-2 my-1"
            >
              <div
                className="font-mono text-md leading-relaxed whitespace-pre-wrap break-words"
                style={{ fontSize: 11, color: "var(--t3)" }}
              >
                {text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
