import { memo } from "react";
import { formatCost } from "../../lib/cost";

interface CostFooterProps {
  totalCost: number;
  mainCost: number;
  mainTurns: number;
  agentCost: number;
  agentCalls: number;
}

export const CostFooter = memo(function CostFooter({
  totalCost,
  mainCost,
  mainTurns,
  agentCost,
  agentCalls,
}: CostFooterProps) {
  return (
    <div
      aria-label="Cost breakdown"
      className="flex flex-row gap-4 font-mono"
      style={{
        padding: 8,
        borderTop: "1px solid var(--bd)",
        marginTop: 8,
        fontSize: 11,
      }}
    >
      <span>
        <span style={{ color: "var(--t3)" }}>Total:</span>{" "}
        <span style={{ color: "var(--t1)" }}>{formatCost(totalCost)}</span>
      </span>
      <span style={{ color: "var(--t3)" }}>&middot;</span>
      <span>
        <span style={{ color: "var(--t3)" }}>Main:</span>{" "}
        <span style={{ color: "var(--t1)" }}>
          {formatCost(mainCost)} ({mainTurns} turns)
        </span>
      </span>
      <span style={{ color: "var(--t3)" }}>&middot;</span>
      <span>
        <span style={{ color: "var(--t3)" }}>Agent:</span>{" "}
        <span style={{ color: "var(--t1)" }}>
          {formatCost(agentCost)} ({agentCalls} calls)
        </span>
      </span>
    </div>
  );
});
