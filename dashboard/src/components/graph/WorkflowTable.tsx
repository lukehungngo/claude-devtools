import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Loader2, CheckCircle2, Workflow as WorkflowIcon, ArrowDownToLine, ArrowUpFromLine, Wrench, Clock } from "lucide-react";
import type { WorkflowSummary, WorkflowAgentSummary } from "../../lib/types";
import { formatTokens } from "../../lib/cost";

export interface WorkflowTableProps {
  workflows: WorkflowSummary[];
}

/** Compact wall-clock duration, e.g. 69000 → "1m09s", 4200 → "4s". */
function formatDuration(ms: number | null): string | null {
  if (ms == null || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

/** Short, friendly model name ("claude-opus-4-8" → "Opus 4.8"). */
function shortModel(model: string | null): string | null {
  if (!model) return null;
  const m = model.match(/claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
  return model;
}

function StatusIcon({ status }: { status: WorkflowAgentSummary["status"] }) {
  return status === "running" ? (
    <Loader2 size={13} className="shrink-0 text-dt-accent animate-spin motion-reduce:animate-none" aria-hidden="true" />
  ) : (
    <CheckCircle2 size={13} className="shrink-0 text-dt-green" aria-hidden="true" />
  );
}

function AgentRow({ agent }: { agent: WorkflowAgentSummary }) {
  const model = shortModel(agent.model);
  return (
    <li
      data-testid={`workflow-agent-${agent.agentId}`}
      data-status={agent.status}
      className="flex flex-col gap-1 rounded-dt border border-dt-border-subtle bg-dt-bg2 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={agent.status} />
        <span className="min-w-0 flex-1 truncate font-sans text-md text-dt-text0" title={agent.label}>
          {agent.label}
        </span>
        {model && (
          <span className="shrink-0 rounded-dt-sm bg-dt-bg3 px-1.5 py-0.5 text-2xs font-mono text-dt-text2" title={agent.model ?? undefined}>
            {model}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 pl-[21px] text-sm font-mono tabular-nums text-dt-text2">
        <span className="inline-flex items-center gap-1" title="Input tokens">
          <ArrowDownToLine size={11} className="shrink-0" aria-hidden="true" />
          {formatTokens(agent.tokens.inputTokens)}
        </span>
        <span className="inline-flex items-center gap-1" title="Output tokens">
          <ArrowUpFromLine size={11} className="shrink-0" aria-hidden="true" />
          {formatTokens(agent.tokens.outputTokens)}
        </span>
        {agent.toolCalls > 0 && (
          <span className="inline-flex items-center gap-1" title="Tool calls">
            <Wrench size={11} className="shrink-0" aria-hidden="true" />
            {agent.toolCalls}
          </span>
        )}
      </div>
      {agent.resultSummary && (
        <p className="pl-[21px] text-sm text-dt-text2/90 line-clamp-2" title={agent.resultSummary}>
          {agent.resultSummary}
        </p>
      )}
    </li>
  );
}

/** Group agents under their phase titles (phases are ordered in the summary). */
function phaseGroups(wf: WorkflowSummary): { title: string; agents: WorkflowAgentSummary[] }[] {
  if (!wf.phases) return [{ title: "", agents: wf.agents }];
  return wf.phases.map((title) => ({
    title,
    agents: wf.agents.filter((a) => a.phase === title),
  }));
}

function WorkflowCard({ wf }: { wf: WorkflowSummary }) {
  const groups = phaseGroups(wf);
  return (
    <section data-testid={`workflow-${wf.id}`} className="rounded-dt-lg border border-dt-border bg-dt-bg1">
      <header className="flex flex-col gap-1.5 border-b border-dt-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <WorkflowIcon size={16} className="shrink-0 text-dt-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-lg font-semibold text-dt-text0" title={wf.id}>
            {wf.id}
          </span>
        </div>
        {/* Counts + totals — summed tokens + wall-clock duration */}
        <div
          data-testid={`workflow-totals-${wf.id}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[24px] text-sm font-mono tabular-nums text-dt-text1"
        >
          <span className="text-dt-text2">
            {wf.running > 0 && <span className="text-dt-accent">{wf.running} running · </span>}
            {wf.finished} done · {wf.agentCount} agents
          </span>
          <span className="inline-flex items-center gap-1" title="Total input tokens">
            <ArrowDownToLine size={13} className="shrink-0" aria-hidden="true" />
            {formatTokens(wf.tokens.inputTokens)}
          </span>
          <span className="inline-flex items-center gap-1" title="Total output tokens">
            <ArrowUpFromLine size={13} className="shrink-0" aria-hidden="true" />
            {formatTokens(wf.tokens.outputTokens)}
          </span>
          {formatDuration(wf.durationMs) && (
            <span className="inline-flex items-center gap-1" title="Workflow duration">
              <Clock size={13} className="shrink-0" aria-hidden="true" />
              {formatDuration(wf.durationMs)}
            </span>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {groups.map((g, i) => (
          <div key={g.title || i} className="flex flex-col gap-2">
            {g.title && (
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.6px] text-dt-text2">
                <span className="truncate">{g.title}</span>
                <span className="tabular-nums text-dt-text2/70">{g.agents.length}</span>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {g.agents.map((a) => (
                <AgentRow key={a.agentId} agent={a} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Workflow-table for the Graph right panel. Lists each workflow in the session
 * with its agents (status, model, tokens, tools, result), grouped by phase when
 * the journal recorded phases. Renders nothing structural when there are no
 * workflows — the caller shows the empty state.
 */
export function WorkflowTable({ workflows }: WorkflowTableProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !rootRef.current) return;
      // y-only entrance on the workflow CARDS (not every row). NEVER animate
      // opacity from 0 here: a staggered `from({opacity:0})` interrupted by a
      // re-render strands rows invisible (the documented edge-opacity bug). A
      // y-slide is safe — if interrupted, rows stay visible, just offset.
      gsap.from(rootRef.current.querySelectorAll("section[data-testid^='workflow-']"), {
        y: 8,
        duration: 0.25,
        stagger: 0.05,
        ease: "power2.out",
      });
    },
    { scope: rootRef, dependencies: [workflows.length] },
  );

  if (workflows.length === 0) {
    return (
      <div data-testid="workflow-table-empty" className="flex h-full items-center justify-center px-6 text-center text-md font-mono text-dt-text2">
        No workflows in this session
      </div>
    );
  }

  return (
    <div ref={rootRef} data-testid="workflow-table" className="flex h-full flex-col gap-3 overflow-y-auto p-3 dt-scrollbar">
      {workflows.map((wf) => (
        <WorkflowCard key={wf.id} wf={wf} />
      ))}
    </div>
  );
}
