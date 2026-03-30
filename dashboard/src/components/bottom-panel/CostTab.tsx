import { memo, useMemo } from "react";
import type { SessionMetrics, AgentNode } from "../../lib/types";
import { formatCost, formatTokens } from "../../lib/cost";

export interface CostTabProps {
  metrics: SessionMetrics | null;
}

function CostTabInner({ metrics }: CostTabProps) {
  const { burnRate, sortedNodes } = useMemo(() => {
    if (!metrics) return { burnRate: 0, sortedNodes: [] as AgentNode[] };
    const rate = metrics.duration > 0
      ? (metrics.tokens.totalCost / metrics.duration) * 60000
      : 0;
    const nodes = [...metrics.dag.nodes].sort(
      (a, b) => b.tokenUsage.totalCost - a.tokenUsage.totalCost,
    );
    return { burnRate: rate, sortedNodes: nodes };
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
        <CostCard label="Burn Rate" value={`${formatCost(burnRate)}/min`} />
        <CostCard
          label="Cache Savings"
          value={formatTokens(metrics.tokens.cacheReadTokens)}
          subtitle="cache read tokens"
        />
      </div>

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
}

function CostCard({ label, value, subtitle }: CostCardProps) {
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
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--t1)" }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

export const CostTab = memo(CostTabInner);
