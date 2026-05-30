import { useState, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Loader2, CheckCircle2, AlertCircle, Network, ChevronDown } from "lucide-react";
import type { AgentDAG } from "../../lib/types";
import { summarizeDag } from "../../lib/graphSummary";

export interface GraphSummaryProps {
  dag: AgentDAG;
  runningAgentIds: ReadonlySet<string>;
}

/** How many type rows to show before collapsing the rest into "+k more". */
const MAX_TYPES = 7;

/** Title-case a node type for display ("main" → "Main"). */
function typeLabel(type: string): string {
  return type === "main" ? "Main" : type;
}

/**
 * Floating, collapsible summary of the current agent graph — pinned to the
 * top-left of the canvas like a map legend. Shows total / running / finished
 * and a per-type breakdown. Status uses icon + label + color (never color
 * alone). Counts come from `summarizeDag`, which mirrors the node 2-mode model.
 */
export function GraphSummary({ dag, runningAgentIds }: GraphSummaryProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const s = summarizeDag(dag, runningAgentIds);

  useGSAP(
    () => {
      const reduce =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !rootRef.current) return;
      gsap.from(rootRef.current, { opacity: 0, y: -6, duration: 0.25, ease: "power2.out" });
    },
    { scope: rootRef },
  );

  const shownTypes = s.byType.slice(0, MAX_TYPES);
  const overflow = s.byType.length - shownTypes.length;

  return (
    <div
      ref={rootRef}
      data-testid="graph-summary"
      role="region"
      aria-label={`Graph summary: ${s.total} agents, ${s.running} running, ${s.finished} finished`}
      className="absolute top-3 left-3 z-20 w-52 select-none rounded-dt-lg border border-dt-border bg-dt-bg2/95 backdrop-blur-sm shadow-dt-lg"
    >
      {/* Header — total + collapse toggle */}
      <button
        type="button"
        data-testid="graph-summary-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-dt-fast hover:bg-dt-bg3 rounded-dt-lg"
      >
        <Network size={14} className="shrink-0 text-dt-text2" aria-hidden="true" />
        <span className="text-2xs font-semibold uppercase tracking-[0.6px] text-dt-text2">
          Graph
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-md font-bold tabular-nums text-dt-text0" data-testid="graph-summary-total">
            {s.total}
          </span>
          <span className="text-2xs text-dt-text2">nodes</span>
          <ChevronDown
            size={13}
            className={[
              "ml-0.5 shrink-0 text-dt-text2 transition-transform duration-dt-fast",
              collapsed ? "-rotate-90" : "",
            ].join(" ")}
            aria-hidden="true"
          />
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 pt-0.5">
          {/* Running / finished tallies */}
          <div className="flex items-center gap-3 border-t border-dt-border-subtle pt-2">
            <span
              className={["inline-flex items-center gap-1.5", s.running === 0 ? "opacity-60" : ""].join(" ")}
              data-testid="graph-summary-running"
            >
              <Loader2
                size={13}
                className={[
                  "shrink-0",
                  // Only spin / use the accent when something is actually running —
                  // a perpetual spinner next to "0 running" reads as false activity.
                  s.running > 0 ? "text-dt-accent animate-spin motion-reduce:animate-none" : "text-dt-text2",
                ].join(" ")}
                aria-hidden="true"
              />
              <span className="font-mono text-md font-bold tabular-nums text-dt-text0">{s.running}</span>
              <span className="text-2xs text-dt-text2">running</span>
            </span>
            <span className="inline-flex items-center gap-1.5" data-testid="graph-summary-finished">
              <CheckCircle2 size={13} className="shrink-0 text-dt-green" aria-hidden="true" />
              <span className="font-mono text-md font-bold tabular-nums text-dt-text0">{s.finished}</span>
              <span className="text-2xs text-dt-text2">finished</span>
            </span>
            {s.errored > 0 && (
              <span className="inline-flex items-center gap-1.5" data-testid="graph-summary-errored">
                <AlertCircle size={13} className="shrink-0 text-dt-red" aria-hidden="true" />
                <span className="font-mono text-md font-bold tabular-nums text-dt-text0">{s.errored}</span>
                <span className="text-2xs text-dt-text2">error</span>
              </span>
            )}
          </div>

          {/* Per-type legend */}
          {shownTypes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 border-t border-dt-border-subtle pt-2" data-testid="graph-summary-types">
              {shownTypes.map((t) => (
                <li key={t.type} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-sans text-dt-text1" title={typeLabel(t.type)}>
                    {typeLabel(t.type)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-dt-text2">{t.count}</span>
                </li>
              ))}
              {overflow > 0 && (
                <li className="text-2xs text-dt-text2">+{overflow} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
