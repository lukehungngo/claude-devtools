import type { SessionMetrics } from "../../lib/types";
import { formatCost, formatTokens, formatDuration } from "../../lib/cost";

interface CostStripProps {
  metrics: SessionMetrics | null;
}

export function CostStrip({ metrics }: CostStripProps): JSX.Element | null {
  if (!metrics) return null;

  const sessionHash = metrics.session.id.slice(0, 8);
  const { inputTokens, outputTokens, cacheReadTokens, totalCost } = metrics.tokens;

  return (
    <div className="text-base text-dt-text2 flex gap-3 px-4 py-1.5 border-t border-dt-border bg-dt-bg2 font-mono shrink-0">
      <div className="flex gap-2">
        <span>
          In:{" "}
          <span className="text-dt-text1">{formatTokens(inputTokens)}</span>
        </span>
        {cacheReadTokens > 0 && (
          <>
            <span>{"\u00B7"}</span>
            <span>
              Cached:{" "}
              <span className="text-dt-text1">{formatTokens(cacheReadTokens)}</span>
            </span>
          </>
        )}
        <span>{"\u00B7"}</span>
        <span>
          Out:{" "}
          <span className="text-dt-text1">{formatTokens(outputTokens)}</span>
        </span>
      </div>
      <div>
        Cost:{" "}
        <span className="text-dt-text1">{formatCost(totalCost)}</span>
      </div>
      <div>
        Duration:{" "}
        <span className="text-dt-text1">{formatDuration(metrics.duration)}</span>
      </div>
      <div className="ml-auto">
        Session:{" "}
        <span className="text-dt-purple">{sessionHash}</span>
      </div>
    </div>
  );
}
