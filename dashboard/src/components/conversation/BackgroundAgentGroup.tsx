import { memo } from "react";
import type { AgentNode } from "../../lib/types";
import { isSyntheticAgentId } from "../../lib/agentIds";
import { useLiveDuration } from "../../hooks/useLiveDuration";
import { formatTokens, formatCost } from "../../lib/cost";

/**
 * In-conversation Background Agents dispatch block.
 *
 * Renders a collapsible group with one row per dispatched subagent.
 * Data source: subset of the DAG nodes that are children of "main" and
 * fall within this turn's time window. Synthetic agents (Phase 3) are
 * first-class — they render with "—" for tokens/cost since that data
 * isn't available.
 *
 * Design: Anthropic handoff `dashboard.html:1812-2028`
 */
interface BackgroundAgentGroupProps {
  agents: AgentNode[];
  isLive: boolean;
  onSelect?: (agentId: string) => void;
}

export const BackgroundAgentGroup = memo(function BackgroundAgentGroup({
  agents,
  isLive,
  onSelect,
}: BackgroundAgentGroupProps) {
  if (agents.length === 0) return null;

  const runningCount = agents.filter((a) => a.status === "active").length;
  const doneCount = agents.filter((a) => a.status === "completed").length;
  const errorCount = agents.filter((a) => a.status === "error").length;
  const hasRunning = runningCount > 0;

  // Group-level totals across REAL agents only — synthetic agents have no
  // token/cost data; summing zeros into the group total would mislead.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let realAgents = 0;
  for (const a of agents) {
    if (isSyntheticAgentId(a.id)) continue;
    realAgents++;
    totalInputTokens += a.tokenUsage.inputTokens;
    totalOutputTokens += a.tokenUsage.outputTokens;
    totalCost += a.tokenUsage.totalCost;
  }

  return (
    <details
      className="agroup"
      data-state={hasRunning ? "running" : "idle"}
      open={hasRunning}
      style={{
        background: hasRunning ? "var(--bg-e)" : "transparent",
        border: `1px solid ${hasRunning ? "var(--acc)" : "var(--bd)"}`,
        borderRadius: "var(--r-sm)",
        marginTop: "var(--sp-2)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "var(--sp-2) var(--sp-3)",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          fontSize: "var(--fs-md)",
        }}
      >
        <span style={{ color: "var(--resp-dispatch)" }}>⎇</span>
        <span style={{ fontWeight: 600, color: "var(--t1)" }}>
          Background agents <b style={{ color: "var(--resp-dispatch)" }}>×{agents.length}</b>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginLeft: "auto", color: "var(--t2)" }}>
          {hasRunning && (
            <span
              className="t-mono-xs"
              style={{
                background: "var(--acc)",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: "var(--r-pill)",
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              {runningCount} RUNNING
            </span>
          )}
          {doneCount > 0 && (
            <span className="t-mono-xs" style={{ color: "var(--grn)" }}>
              ✓ {doneCount} done
            </span>
          )}
          {errorCount > 0 && (
            <span className="t-mono-xs" style={{ color: "var(--red)" }}>
              ✗ {errorCount} error
            </span>
          )}
          {realAgents > 0 && (
            <>
              <span className="t-mono-xs">↓ {formatTokens(totalInputTokens + totalOutputTokens)}</span>
              <span className="t-mono-xs" style={{ color: "var(--amb)", fontWeight: 600 }}>
                {formatCost(totalCost)}
              </span>
            </>
          )}
        </span>
      </summary>
      <div style={{ borderTop: "1px solid var(--bd)" }}>
        {agents.map((agent) => (
          <BackgroundAgentRow key={agent.id} agent={agent} isLive={isLive} onSelect={onSelect} />
        ))}
      </div>
    </details>
  );
});

interface BackgroundAgentRowProps {
  agent: AgentNode;
  isLive: boolean;
  onSelect?: (agentId: string) => void;
}

const BackgroundAgentRow = memo(function BackgroundAgentRow({
  agent,
  isLive,
  onSelect,
}: BackgroundAgentRowProps) {
  const isSynthetic = isSyntheticAgentId(agent.id);
  const isRunning = agent.status === "active";
  const duration = useLiveDuration(
    agent.startTime ?? null,
    agent.endTime ?? null,
    isLive && isRunning,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(agent.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(agent.id);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-2) var(--sp-3)",
        borderTop: "1px solid var(--bd)",
        fontSize: "var(--fs-md)",
        cursor: "pointer",
        background: isRunning ? "var(--acc-bg)" : "transparent",
      }}
    >
      <span
        className="t-mono-xs"
        style={{
          background: "var(--span-swe)",
          color: "var(--span-swe-t)",
          padding: "1px 6px",
          borderRadius: "var(--r-xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {agent.type.slice(0, 3)}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--acc)", fontSize: "var(--fs-base)", fontWeight: 700 }}
      >
        {agent.id.slice(0, 8)}
      </span>
      <span
        style={{
          color: "var(--t1)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {agent.description ?? agent.type}
      </span>
      <span
        className="t-mono-xs"
        style={{
          padding: "1px 6px",
          borderRadius: "var(--r-pill)",
          background:
            agent.status === "active"
              ? "var(--acc)"
              : agent.status === "error"
                ? "var(--red-bg)"
                : "var(--grn-bg)",
          color:
            agent.status === "active"
              ? "#fff"
              : agent.status === "error"
                ? "var(--red)"
                : "var(--grn)",
          fontWeight: 700,
          letterSpacing: 0.3,
        }}
      >
        {agent.status === "active" ? "● running" : agent.status === "error" ? "✗ error" : "✓ done"}
      </span>
      <span className="t-mono-xs" style={{ color: isRunning ? "var(--acc)" : "var(--t1)", minWidth: 56, textAlign: "right" }}>
        {duration}
      </span>
      <span className="t-mono-xs" style={{ color: "var(--t1)", minWidth: 56, textAlign: "right" }}>
        {isSynthetic
          ? "—"
          : `↓ ${formatTokens(agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens)}`}
      </span>
      <span className="t-mono-xs" style={{ color: "var(--amb)", fontWeight: 600, minWidth: 48, textAlign: "right" }}>
        {isSynthetic ? "—" : formatCost(agent.tokenUsage.totalCost)}
      </span>
    </div>
  );
});
