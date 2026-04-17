import { useState, useMemo } from "react";

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

  const { nonEmpty, totalChars } = useMemo(() => {
    const filtered = items.filter((t) => t.trim().length > 0);
    return {
      nonEmpty: filtered,
      totalChars: filtered.reduce((sum, t) => sum + t.length, 0),
    };
  }, [items]);

  if (nonEmpty.length === 0) return null;

  return (
    <div
      className="rounded-lg my-1.5 overflow-hidden border border-dt-border"
      style={{ background: "var(--resp-working-bg, var(--bg-s))" }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-1.5"
      >
        <span
          className="shrink-0 inline-block transition-transform duration-150 text-dt-text2 w-3 text-center text-[9px]"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9656;
        </span>
        <span
          className="font-mono font-semibold uppercase tracking-wide text-[10px]"
          style={{ color: "var(--resp-working)" }}
        >
          Working
        </span>
        <span className="font-mono text-dt-text2 text-[10px]">
          {nonEmpty.length > 1
            ? `${nonEmpty.length} steps \u00b7 ${totalChars} chars`
            : `${totalChars} chars`}
        </span>
      </div>

      {/* Body — collapsed by default */}
      {expanded && (
        <div className="px-2.5 pb-2 pl-6">
          {nonEmpty.map((text, i) => (
            <div
              key={i}
              className="border-l-2 pl-2 my-1"
              style={{ borderColor: "var(--resp-working)" }}
            >
              <div className="font-mono leading-relaxed whitespace-pre-wrap break-words text-dt-text2 text-[11px]">
                {text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
