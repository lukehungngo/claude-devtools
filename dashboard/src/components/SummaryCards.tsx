import type { SessionMetrics } from "../lib/types";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";

export function SummaryCards({ metrics }: { metrics: SessionMetrics }) {
  const cards = [
    {
      label: "Total Cost",
      value: formatCost(metrics.tokens.totalCost),
      sub: metrics.models.join(", "),
    },
    {
      label: "Tokens",
      value: formatTokens(
        metrics.tokens.inputTokens + metrics.tokens.outputTokens
      ),
      sub: `In: ${formatTokens(metrics.tokens.inputTokens)} / Out: ${formatTokens(metrics.tokens.outputTokens)}`,
    },
    {
      label: "Cache Hit",
      value:
        metrics.tokens.inputTokens > 0
          ? `${Math.round((metrics.tokens.cacheReadTokens / (metrics.tokens.inputTokens + metrics.tokens.cacheReadTokens)) * 100)}%`
          : "N/A",
      sub: `${formatTokens(metrics.tokens.cacheReadTokens)} cached`,
    },
    {
      label: "Duration",
      value: formatDuration(metrics.duration),
      sub: `${metrics.totalEvents} events`,
    },
    {
      label: "Agents",
      value: metrics.totalAgents.toString(),
      sub: `${metrics.totalToolCalls} tool calls`,
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-3 p-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-dt-bg2 border border-dt-border rounded-lg p-3"
        >
          <div className="text-xs text-dt-text2 uppercase tracking-wider">
            {card.label}
          </div>
          <div className="text-xl font-bold text-dt-text0 mt-1">{card.value}</div>
          <div className="text-xs text-dt-text2 mt-0.5">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
