import { useState } from "react";
import type { ContentItem } from "../../lib/types";

interface ThinkingGroupProps {
  items: ContentItem[];
}

/** Collapsible group for all thinking blocks in a turn — collapsed by default */
export function ThinkingGroup({ items }: ThinkingGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const thinkingItems = items.filter(
    (item): item is ContentItem & { thinking: string } =>
      item.type === "thinking" && "thinking" in item && !!item.thinking,
  );
  if (thinkingItems.length === 0) return null;

  const totalChars = thinkingItems.reduce((sum, item) => sum + item.thinking.length, 0);

  return (
    <div
      className="rounded-lg my-1.5 overflow-hidden"
      style={{ border: "1px solid var(--bd)", background: "var(--resp-think-bg, var(--bg-s))" }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 cursor-pointer select-none"
        style={{ padding: "6px 10px" }}
      >
        <span
          className="shrink-0 inline-block transition-transform duration-150 t-mono-xs"
          style={{
            width: 12,
            textAlign: "center",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9656;
        </span>
        <span
          className="font-mono font-semibold uppercase tracking-wide t-mono-sm"
          style={{ color: "var(--pur)" }}
        >
          Thinking
        </span>
        <span
          className="font-mono t-mono-sm"
          style={{ color: "var(--t3)" }}
        >
          {thinkingItems.length > 1
            ? `${thinkingItems.length} blocks`
            : `${totalChars} chars`}
        </span>
      </div>

      {/* Body — collapsed by default */}
      {expanded && (
        <div
          style={{ padding: "0 10px 8px 24px" }}
        >
          {thinkingItems.map((item, i) => (
            <div
              key={i}
              className="border-l-2 border-dt-purple pl-2 my-1"
            >
              <div className="text-dt-text2 italic font-mono text-md leading-[1.6] whitespace-pre-wrap break-words">
                {item.thinking}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
