import type { SessionMetrics } from "../../lib/types";
import { formatCost, formatTokens, formatDuration } from "../../lib/cost";

interface CostStripProps {
  metrics: SessionMetrics | null;
}

export function CostStrip({ metrics }: CostStripProps) {
  if (!metrics) return null;

  const sessionHash = metrics.session.id.slice(0, 8);

  return (
    <div
      style={{
        fontSize: "10px",
        color: "var(--text-2)",
        display: "flex",
        gap: "10px",
        padding: "4px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-2)",
        fontFamily: "var(--font)",
        flexShrink: 0,
      }}
    >
      <div>
        Tokens:{" "}
        <span style={{ color: "var(--text-1)" }}>
          In: {formatTokens(metrics.tokens.inputTokens)}
        </span>{" "}
        {"\u00B7"}{" "}
        <span style={{ color: "var(--text-1)" }}>
          Out: {formatTokens(metrics.tokens.outputTokens)}
        </span>
      </div>
      <div>
        Cost:{" "}
        <span style={{ color: "var(--text-1)" }}>
          {formatCost(metrics.tokens.totalCost)}
        </span>
      </div>
      <div>
        Duration:{" "}
        <span style={{ color: "var(--text-1)" }}>
          {formatDuration(metrics.duration)}
        </span>
      </div>
      <div style={{ marginLeft: "auto" }}>
        Session:{" "}
        <span style={{ color: "var(--purple)" }}>{sessionHash}</span>
      </div>
    </div>
  );
}
