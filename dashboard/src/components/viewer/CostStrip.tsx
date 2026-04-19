import type { SessionMetrics } from "../../lib/types";
import { formatCost, formatTokens, formatDuration } from "../../lib/cost";

interface CostStripProps {
  metrics: SessionMetrics | null;
}

export function CostStrip({ metrics }: CostStripProps) {
  if (!metrics) return null;

  const sessionHash = metrics.session.id.slice(0, 8);
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = metrics.tokens;

  return (
    <div className="text-base text-dt-text2 flex gap-3 px-4 py-1.5 border-t border-dt-border bg-dt-bg2 font-mono shrink-0">
      <div>
        Tokens:{" "}
        <span className="text-dt-text1">
          In: {formatTokens(inputTokens)}
        </span>
        {cacheReadTokens > 0 && (
          <>
            {" "}{"\u00B7"}{" "}
            <span className="text-dt-text1">
              CR: {formatTokens(cacheReadTokens)}
            </span>
          </>
        )}
        {cacheWriteTokens > 0 && (
          <>
            {" "}{"\u00B7"}{" "}
            <span className="text-dt-text1">
              CW: {formatTokens(cacheWriteTokens)}
            </span>
          </>
        )}
        {" "}{"\u00B7"}{" "}
        <span className="text-dt-text1">
          Out: {formatTokens(outputTokens)}
        </span>
      </div>
      <div>
        Cost:{" "}
        <span className="text-dt-text1">
          {formatCost(metrics.tokens.totalCost)}
        </span>
      </div>
      <div>
        Duration:{" "}
        <span className="text-dt-text1">
          {formatDuration(metrics.duration)}
        </span>
      </div>
      <div className="ml-auto">
        Session:{" "}
        <span className="text-dt-purple">{sessionHash}</span>
      </div>
    </div>
  );
}
