import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeEvents } from "./dag-builder.js";
import { getClaudeProjectsDir } from "../parser/session-discovery.js";
import type {
  SessionEvent,
  SessionInfo,
  AggregatedTokens,
  WorkflowSummary,
  WorkflowAgentSummary,
} from "../types.js";

/** Parsed `journal.jsonl` for one workflow. */
export interface WorkflowJournal {
  id: string;
  /** Started agents, in start order. phase/label captured when present. */
  started: { agentId: string; phase: string | null; label: string | null }[];
  /** agentId → structured result payload (present iff the agent finished). */
  results: Map<string, unknown>;
}

const MAX_SUMMARY = 120;

function truncate(s: string): string {
  return s.length > MAX_SUMMARY ? s.slice(0, MAX_SUMMARY - 1) + "…" : s;
}

/** Pull the most-human field out of a result payload for the row summary. */
function deriveSummary(result: unknown): string | null {
  if (result == null) return null;
  if (typeof result === "string") return truncate(result);
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    const cand = r.summary ?? r.description ?? r.result;
    if (typeof cand === "string" && cand.trim()) return truncate(cand);
    try {
      return truncate(JSON.stringify(result));
    } catch {
      return null;
    }
  }
  return null;
}

/** Derive a short human label for an agent row. */
function deriveLabel(label: string | null, result: unknown, agentId: string): string {
  if (label && label.trim() && !label.startsWith("v2:")) return label;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const k of ["title", "label", "name", "area", "package"]) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return truncate(v);
    }
    const sum = r.summary;
    if (typeof sum === "string" && sum.trim()) return truncate(sum);
  }
  return `agent-${agentId.slice(0, 8)}`;
}

/**
 * Build a workflow summary from its parsed journal + the agents' event streams.
 *
 * Pure and deterministic. Status: a journal `result` ⇒ finished; otherwise
 * running while the session is live, else finished (the workflow has ended).
 * Phases come straight from the journal — null when none were recorded, in
 * which case agents stay in start order.
 */
export function buildWorkflowSummary(
  journal: WorkflowJournal,
  agentEventsById: ReadonlyMap<string, SessionEvent[]>,
  sessionIsRunning: boolean,
): WorkflowSummary {
  const phaseOrder: string[] = [];
  for (const s of journal.started) {
    if (s.phase && !phaseOrder.includes(s.phase)) phaseOrder.push(s.phase);
  }
  const hasPhases = phaseOrder.length > 0;

  const agents: WorkflowAgentSummary[] = journal.started.map((s) => {
    const events = agentEventsById.get(s.agentId) ?? [];
    const analysis = analyzeEvents(events);
    const result = journal.results.get(s.agentId);
    const hasResult = journal.results.has(s.agentId);
    const status: "running" | "finished" = hasResult
      ? "finished"
      : sessionIsRunning
        ? "running"
        : "finished";
    return {
      agentId: s.agentId,
      label: deriveLabel(s.label, result, s.agentId),
      phase: s.phase,
      status,
      model: analysis.model ?? null,
      tokens: analysis.tokens,
      toolCalls: analysis.toolCalls,
      mcpToolCalls: analysis.mcpToolCalls,
      resultSummary: deriveSummary(result),
    };
  });

  if (hasPhases) {
    const idx = (p: string | null) => (p ? phaseOrder.indexOf(p) : phaseOrder.length);
    // Stable sort by phase order; agents keep start order within a phase.
    agents.sort((a, b) => idx(a.phase) - idx(b.phase));
  }

  // Total tokens summed across all agents.
  const tokens: AggregatedTokens = agents.reduce(
    (acc, a) => ({
      inputTokens: acc.inputTokens + a.tokens.inputTokens,
      outputTokens: acc.outputTokens + a.tokens.outputTokens,
      cacheWriteTokens: acc.cacheWriteTokens + a.tokens.cacheWriteTokens,
      cacheReadTokens: acc.cacheReadTokens + a.tokens.cacheReadTokens,
      totalCost: acc.totalCost + a.tokens.totalCost,
    }),
    { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
  );

  // Wall-clock duration: earliest → latest agent event timestamp across the
  // workflow (the journal carries no timestamps, so we derive from the agents'
  // own event streams).
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const s of journal.started) {
    for (const e of agentEventsById.get(s.agentId) ?? []) {
      const t = Date.parse(e.timestamp);
      if (Number.isNaN(t)) continue;
      if (t < minTs) minTs = t;
      if (t > maxTs) maxTs = t;
    }
  }
  const durationMs = Number.isFinite(minTs) && maxTs >= minTs ? maxTs - minTs : null;

  const running = agents.filter((a) => a.status === "running").length;
  return {
    id: journal.id,
    agentCount: agents.length,
    running,
    finished: agents.length - running,
    tokens,
    durationMs,
    phases: hasPhases ? phaseOrder : null,
    agents,
  };
}

/** Parse one `journal.jsonl` into a WorkflowJournal (fail-safe per line). */
function parseJournal(id: string, path: string): WorkflowJournal {
  const started: WorkflowJournal["started"] = [];
  const results = new Map<string, unknown>();
  let content = "";
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return { id, started, results };
  }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Record<string, unknown>;
      const agentId = typeof e.agentId === "string" ? e.agentId : null;
      if (!agentId) continue;
      const phase = typeof e.phase === "string" ? e.phase : null;
      // `label` is a human label; `key` is a v2:<hash> cache key (not a label).
      const label = typeof e.label === "string" ? e.label : null;
      if (e.type === "started") {
        started.push({ agentId, phase, label });
      } else if (e.type === "result") {
        results.set(agentId, e.result);
      }
    } catch {
      // skip malformed line, never crash
    }
  }
  return { id, started, results };
}

/**
 * Discover all workflows for a session by scanning every project dir's
 * `{sessionId}/subagents/workflows/<wf_id>/journal.jsonl`. Mirrors the
 * multi-project-dir scan in loadFullSession so worktree-scattered workflows
 * are found.
 */
export function discoverWorkflows(sessionInfo: SessionInfo): WorkflowJournal[] {
  const journals: WorkflowJournal[] = [];
  const root = getClaudeProjectsDir();
  if (!existsSync(root)) return journals;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return journals;
  }

  for (const projectDir of projectDirs) {
    const wfRoot = join(root, projectDir, sessionInfo.id, "subagents", "workflows");
    if (!existsSync(wfRoot)) continue;
    let wfDirs;
    try {
      wfDirs = readdirSync(wfRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const wf of wfDirs) {
      const journalPath = join(wfRoot, wf.name, "journal.jsonl");
      if (!existsSync(journalPath)) continue;
      try {
        if (statSync(journalPath).size === 0) continue;
      } catch {
        continue;
      }
      journals.push(parseJournal(wf.name, journalPath));
    }
  }
  return journals;
}

/**
 * Build all workflow summaries for a session. `subagentEvents` is the
 * already-loaded per-agent map from loadFullSession; workflow agents are keyed
 * by the same agentId the journal references.
 */
export function buildWorkflows(
  sessionInfo: SessionInfo,
  subagentEvents: ReadonlyMap<string, SessionEvent[]>,
  sessionIsRunning: boolean,
): WorkflowSummary[] {
  return discoverWorkflows(sessionInfo)
    .filter((j) => j.started.length > 0)
    .map((j) => buildWorkflowSummary(j, subagentEvents, sessionIsRunning));
}
