import { memo, useMemo } from "react";
import type { SessionMetrics, AgentNode } from "../../lib/types";
import { formatCost, formatTokens } from "../../lib/cost";

export interface CostTabProps {
  metrics: SessionMetrics | null;
  /**
   * OpenTelemetry-style `stop_reason` from the most recent SDK result event
   * (CC v2.1.143, P2-5). Optional; hidden when both this and finishReasons are undefined.
   */
  stopReason?: string;
  /**
   * OpenTelemetry-style `gen_ai.response.finish_reasons` from the most recent
   * SDK result event (CC v2.1.143, P2-5). Optional.
   */
  finishReasons?: readonly string[];
}

/** Compute projected total cost based on context window usage. */
export function computeProjectedTotal(
  totalCost: number,
  contextPercent: number,
  isSessionDone: boolean,
): { value: string; subtitle: string } {
  if (isSessionDone) {
    return { value: formatCost(totalCost), subtitle: "final" };
  }
  if (contextPercent > 0) {
    const projected = totalCost * (100 / contextPercent);
    return { value: formatCost(projected), subtitle: "estimated at current rate" };
  }
  return { value: `~${formatCost(totalCost)}`, subtitle: "estimated at current rate" };
}

/** Determine burn rate trend by comparing recent (last 30s) vs overall rate. */
export function computeBurnRateTrend(
  tokensByTurn: SessionMetrics["tokensByTurn"],
  overallRate: number,
): { arrow: string; color: string } {
  if (tokensByTurn.length < 2 || overallRate <= 0) {
    return { arrow: "→", color: "var(--t3)" };
  }
  const now = Date.now();
  const cutoff = now - 30_000;
  const recentTurns = tokensByTurn.filter(
    (t) => new Date(t.timestamp).getTime() >= cutoff,
  );
  if (recentTurns.length === 0) {
    return { arrow: "→", color: "var(--t3)" };
  }
  const recentCost = recentTurns.reduce((sum, t) => sum + t.cost, 0);
  const earliestRecent = new Date(recentTurns[0].timestamp).getTime();
  const recentDuration = now - earliestRecent;
  if (recentDuration <= 0) {
    return { arrow: "→", color: "var(--t3)" };
  }
  const recentRate = (recentCost / recentDuration) * 60_000;
  if (recentRate > overallRate * 1.2) {
    return { arrow: "↑", color: "var(--red)" };
  }
  if (recentRate < overallRate * 0.8) {
    return { arrow: "↓", color: "var(--grn)" };
  }
  return { arrow: "→", color: "var(--t3)" };
}

function CostTabInner({ metrics, stopReason, finishReasons }: CostTabProps) {
  const { burnRate, sortedNodes, burnTrend, projected } = useMemo(() => {
    if (!metrics) return {
      burnRate: 0,
      sortedNodes: [] as AgentNode[],
      burnTrend: { arrow: "→", color: "var(--t3)" },
      projected: { value: "$0.0000", subtitle: "" },
    };
    const rate = metrics.duration > 0
      ? (metrics.tokens.totalCost / metrics.duration) * 60000
      : 0;
    const nodes = [...metrics.dag.nodes].sort(
      (a, b) => b.tokenUsage.totalCost - a.tokenUsage.totalCost,
    );
    const isSessionDone = metrics.duration > 0 &&
      !metrics.dag.nodes.some((n) => n.status === "active");
    const proj = computeProjectedTotal(
      metrics.tokens.totalCost,
      metrics.contextPercent,
      isSessionDone,
    );
    const trend = computeBurnRateTrend(metrics.tokensByTurn, rate);
    return { burnRate: rate, sortedNodes: nodes, burnTrend: trend, projected: proj };
  }, [metrics]);

  if (!metrics) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--t3)", fontSize: 13 }}>No cost data</span>
      </div>
    );
  }

  const totalCost = metrics.tokens.totalCost;

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, padding: 12 }}>
        <CostCard label="Session Cost" value={formatCost(totalCost)} />
        <CostCard
          label="Burn Rate"
          value={`${formatCost(burnRate)}/min`}
          suffix={<span style={{ color: burnTrend.color, marginLeft: 4 }}>{burnTrend.arrow}</span>}
        />
        <CostCard
          label="Projected Total"
          value={projected.value}
          subtitle={projected.subtitle}
        />
      </div>

      {/* OpenTelemetry-style result fields (CC v2.1.143, P2-5). Hidden when both absent. */}
      <OtelResultRow stopReason={stopReason} finishReasons={finishReasons} />

      {/* Per-agent breakdown */}
      {sortedNodes.length > 0 && (
        <div style={{ padding: "0 12px 12px" }}>
          {sortedNodes.map((node) => {
            const pct = totalCost > 0
              ? (node.tokenUsage.totalCost / totalCost) * 100
              : 0;
            return (
              <div
                key={node.id}
                style={{ padding: "6px 0", fontSize: 11 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--bg-s)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--t2)",
                      flexShrink: 0,
                    }}
                  >
                    {node.type.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ color: "var(--t1)", fontWeight: 500, flex: 1 }}>{node.type}</span>
                  <span style={{ color: "var(--t2)" }}>{formatCost(node.tokenUsage.totalCost)}</span>
                  <span style={{ color: "var(--t3)", width: 40, textAlign: "right" }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                {(node.tokenUsage.inputTokens > 0 || node.tokenUsage.outputTokens > 0) && (
                  <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "monospace", marginBottom: 3 }}>
                    In: {formatTokens(node.tokenUsage.inputTokens)} · Out: {formatTokens(node.tokenUsage.outputTokens)}
                  </div>
                )}
                <div
                  style={{
                    height: 6,
                    background: "var(--bd)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: 6,
                      background: "var(--acc)",
                      borderRadius: 3,
                      width: `${Math.min(pct, 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CostCardProps {
  label: string;
  value: string;
  subtitle?: string;
  suffix?: React.ReactNode;
}

function CostCard({ label, value, subtitle, suffix }: CostCardProps) {
  return (
    <div
      style={{
        background: "var(--bg-s)",
        border: "1px solid var(--bd)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--t3)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--t1)", display: "flex", alignItems: "baseline" }}>
        {value}{suffix}
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

interface OtelResultRowProps {
  stopReason?: string;
  finishReasons?: readonly string[];
}

function OtelResultRow({ stopReason, finishReasons }: OtelResultRowProps) {
  const hasStop = typeof stopReason === "string" && stopReason.length > 0;
  const hasFinish = Array.isArray(finishReasons) && finishReasons.length > 0;
  if (!hasStop && !hasFinish) return null;
  return (
    <div
      data-testid="otel-result-row"
      style={{
        display: "flex",
        gap: 16,
        padding: "0 12px 8px",
        fontFamily: "monospace",
        fontSize: 11,
        color: "var(--t3)",
        alignItems: "baseline",
      }}
    >
      {hasStop && (
        <span>
          Stop: <span style={{ color: "var(--t2)" }}>{stopReason}</span>
        </span>
      )}
      {hasFinish && (
        <span>
          Finish:{" "}
          <span style={{ color: "var(--t2)" }}>{finishReasons!.join(", ")}</span>
        </span>
      )}
    </div>
  );
}

export const CostTab = memo(CostTabInner);
