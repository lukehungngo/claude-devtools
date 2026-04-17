import { memo } from "react";
import { formatCost, formatTokens } from "../../lib/cost";

interface CostFooterProps {
  totalCost: number;
  mainCost: number;
  mainTurns: number;
  agentCost: number;
  agentCalls: number;
  inputTokens?: number;
  outputTokens?: number;
}

export const CostFooter = memo(function CostFooter({
  totalCost,
  mainCost,
  agentCost,
  agentCalls,
  inputTokens,
  outputTokens,
}: CostFooterProps) {
  const hasMain = mainCost > 0;
  const hasAgent = agentCalls > 0 && agentCost > 0;

  return (
    <div
      aria-label="Cost breakdown"
      className="flex flex-row items-center gap-1.5 font-mono text-dt-text2 mt-2 text-[10px]"
    >
      <span className="text-dt-text1">{formatCost(totalCost)}</span>
      {hasMain && hasAgent && (
        <>
          <span>&middot;</span>
          <span>main {formatCost(mainCost)}</span>
          <span>&middot;</span>
          <span>agents {formatCost(agentCost)} ({agentCalls})</span>
        </>
      )}
      {!hasMain && hasAgent && (
        <>
          <span>&middot;</span>
          <span>{agentCalls} agent{agentCalls !== 1 ? "s" : ""}</span>
        </>
      )}
      {inputTokens != null && outputTokens != null && (inputTokens > 0 || outputTokens > 0) && (
        <>
          <span>&middot;</span>
          <span>In: {formatTokens(inputTokens)} / Out: {formatTokens(outputTokens)}</span>
        </>
      )}
    </div>
  );
});
