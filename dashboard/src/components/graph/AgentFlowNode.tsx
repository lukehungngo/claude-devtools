import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Loader2, CheckCircle2, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Wrench } from "lucide-react";
import type { AgentNode } from "../../lib/types";
import { formatTokens } from "../../lib/cost";
import type { AgentFlowNode as AgentFlowNodeType } from "../../lib/agentFlowElements";

/**
 * Node modes:
 *  - running  — the agent is actively executing.
 *  - finished — the agent is not running and completed cleanly.
 *  - error    — the agent is not running but hit a tool error. Kept visually
 *    distinct (red) so a failed agent is never shown as a green success — wrong
 *    data is worse than no data (data-integrity invariant).
 */
export type NodeMode = "running" | "finished" | "error";

export function nodeMode(running: boolean, status: AgentNode["status"]): NodeMode {
  if (running) return "running";
  if (status === "error") return "error";
  return "finished";
}

/**
 * Per-mode presentation. Status is conveyed by THREE redundant channels —
 * icon + label + color — so meaning never relies on color alone (a11y).
 * Class strings are spelled out in full so Tailwind's content scanner keeps them.
 */
const MODE_STYLES: Record<
  NodeMode,
  { Icon: typeof Loader2; label: string; chip: string; badge: string; border: string; bar: string; spin: boolean }
> = {
  running: {
    Icon: Loader2,
    label: "Running",
    chip: "bg-dt-accent-dim text-dt-accent",
    badge: "bg-dt-accent-dim text-dt-accent",
    border: "border-dt-accent",
    bar: "bg-dt-accent",
    spin: true,
  },
  finished: {
    Icon: CheckCircle2,
    label: "Finished",
    chip: "bg-dt-green-dim text-dt-green",
    badge: "bg-dt-green-dim text-dt-green",
    border: "border-dt-green",
    bar: "bg-dt-green",
    spin: false,
  },
  error: {
    Icon: AlertCircle,
    label: "Error",
    chip: "bg-dt-red-dim text-dt-red",
    badge: "bg-dt-red-dim text-dt-red",
    border: "border-dt-red",
    bar: "bg-dt-red",
    spin: false,
  },
};

/** Friendly title-case for the agent role, e.g. "main" → "Main". */
function displayName(node: AgentNode): string {
  if (node.id === "main" || node.type === "main") return "Main";
  return node.type;
}

function AgentFlowNodeImpl({ data }: NodeProps<AgentFlowNodeType>) {
  const { node, running, selected } = data;
  const mode = nodeMode(running, node.status);
  const s = MODE_STYLES[mode];
  const { Icon } = s;
  const name = displayName(node);
  const ariaLabel = `Agent ${name}, ${s.label}, ${formatTokens(node.tokenUsage.inputTokens)} in, ${formatTokens(node.tokenUsage.outputTokens)} out`;

  return (
    <div
      data-testid={`agent-graph-node-${node.id}`}
      data-running={running ? "true" : "false"}
      data-mode={mode}
      data-expanded={selected ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      aria-label={ariaLabel}
      className={[
        "relative flex flex-col text-left overflow-hidden",
        "bg-dt-bg2 rounded-dt-lg border-2 pl-4 pr-3",
        "transition-all duration-dt-fast cursor-pointer",
        // Compact = small + tight; expanded = wider with breathing room.
        selected ? "w-[15rem] gap-2 py-3 shadow-dt-lg" : "w-44 gap-1 py-2 shadow-dt-sm",
        "hover:shadow-dt-glow",
        s.border,
        running ? "shadow-dt-glow" : "",
        selected ? "ring-2 ring-dt-accent ring-offset-2 ring-offset-dt-bg1" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Hidden connection handles — edges anchor here, no manual edge editing. */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!opacity-0" />

      {/* Status accent bar — full-height colored left edge (theme-robust anchor). */}
      <span className={["absolute left-0 top-0 bottom-0 w-1.5", s.bar].join(" ")} aria-hidden="true" />

      {/* Header: status-icon chip + agent name + status badge */}
      <span className="flex items-center gap-2 w-full">
        <span
          className={[
            "shrink-0 rounded-dt-sm flex items-center justify-center",
            selected ? "w-7 h-7" : "w-5 h-5",
            s.chip,
          ].join(" ")}
          aria-hidden="true"
        >
          <Icon
            size={selected ? 15 : 12}
            className={s.spin ? "animate-spin motion-reduce:animate-none" : ""}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={[
              "block font-semibold font-sans text-dt-text0 truncate",
              selected ? "text-lg" : "text-md",
            ].join(" ")}
            title={name}
          >
            {name}
          </span>
          {selected && node.model && (
            <span className="block text-2xs font-mono text-dt-text2 truncate" title={node.model}>
              {node.model}
            </span>
          )}
        </span>
        {selected ? (
          <span
            className={[
              "shrink-0 px-2 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-[0.4px]",
              s.badge,
            ].join(" ")}
          >
            {s.label}
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center" title={s.label}>
            <span className={["w-2 h-2 rounded-full", s.bar].join(" ")} aria-hidden="true" />
            {/* Status label kept available to screen readers / tests; visually
                the compact node conveys status via the dot + accent bar color. */}
            <span className="sr-only">{s.label}</span>
          </span>
        )}
      </span>

      {/* Expanded-only: description (truncated; full text via title) */}
      {selected && node.description && (
        <span className="block text-base text-dt-text2 truncate w-full" title={node.description}>
          {node.description}
        </span>
      )}

      {/* Expanded-only: metrics row — tokens in/out, tool calls (tabular). */}
      {selected && (
        <span className="flex items-center gap-3 w-full text-sm font-mono tabular-nums text-dt-text1">
          <span className="inline-flex items-center gap-1" title="Input tokens">
            <ArrowDownToLine size={12} className="text-dt-text2 shrink-0" aria-hidden="true" />
            {formatTokens(node.tokenUsage.inputTokens)}
          </span>
          <span className="inline-flex items-center gap-1" title="Output tokens">
            <ArrowUpFromLine size={12} className="text-dt-text2 shrink-0" aria-hidden="true" />
            {formatTokens(node.tokenUsage.outputTokens)}
          </span>
          {node.toolCalls > 0 && (
            <span className="inline-flex items-center gap-1" title="Tool calls">
              <Wrench size={12} className="text-dt-text2 shrink-0" aria-hidden="true" />
              {node.toolCalls}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export const AgentFlowNode = memo(AgentFlowNodeImpl);
