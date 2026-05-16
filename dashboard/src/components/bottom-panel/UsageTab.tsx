import { useEffect, useState } from "react";
import type { UsageBreakdown, PerModelUsage } from "../../lib/usage-types";
import { formatCost, formatTokens } from "../../lib/cost";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: UsageBreakdown }
  | { kind: "error"; message: string };

/**
 * Per-model + cache-hit-ratio breakdown of recent token usage.
 *
 * Data source: `GET /api/usage/breakdown` — aggregates assistant events from
 * local JSONL across discovered sessions. The Anthropic OAuth `/usage`
 * endpoint only returns utilization percentages, so this view never reflects
 * it; it reflects the cost-and-token shape of the JSONL transcripts.
 */
export function UsageTab(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/usage/breakdown");
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: `Failed to load usage breakdown (${res.status})`,
            });
          }
          return;
        }
        const body = (await res.json()) as { breakdown?: UsageBreakdown };
        if (!cancelled) {
          const data = body.breakdown ?? { perModel: [], totalCost: 0 };
          setState({ kind: "ready", data });
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "unknown error";
          setState({
            kind: "error",
            message: `Failed to load usage breakdown: ${message}`,
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div
        className="p-3 t-mono-sm"
        style={{ color: "var(--t3)" }}
      >
        Loading usage breakdown…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="p-3 t-mono-sm"
        style={{ color: "var(--err)" }}
      >
        {state.message}
      </div>
    );
  }

  const { perModel, totalCost } = state.data;

  if (perModel.length === 0) {
    return (
      <div
        className="p-3 t-mono-sm"
        style={{ color: "var(--t3)" }}
      >
        No usage data available yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-3 py-2 t-mono-xs"
        style={{
          color: "var(--t3)",
          borderBottom: "1px solid var(--bd)",
        }}
      >
        <span>Per-model usage</span>
        <span>Total cost: {formatCost(totalCost)}</span>
      </div>
      <div className="overflow-y-auto flex-1">
        <table
          className="w-full t-mono-sm"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr
              style={{
                color: "var(--t3)",
                background: "var(--bg-h)",
              }}
            >
              <th className="text-left px-2 py-1 font-normal">Model</th>
              <th className="text-right px-2 py-1 font-normal">Input</th>
              <th className="text-right px-2 py-1 font-normal">Output</th>
              <th className="text-right px-2 py-1 font-normal">Cache create</th>
              <th className="text-right px-2 py-1 font-normal">Cache read</th>
              <th className="text-left px-2 py-1 font-normal">Cache hit</th>
              <th className="text-right px-2 py-1 font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {perModel.map((row) => (
              <UsageRow key={row.model} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface UsageRowProps {
  row: PerModelUsage;
}

function UsageRow({ row }: UsageRowProps): JSX.Element {
  const pct = Math.round(row.cacheHitRatio * 100);
  return (
    <tr
      data-testid={`usage-row-${row.model}`}
      style={{
        borderBottom: "1px solid var(--bd)",
        color: "var(--t1)",
      }}
    >
      <td className="px-2 py-1">{row.model}</td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {formatTokens(row.inputTokens)}
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {formatTokens(row.outputTokens)}
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {formatTokens(row.cacheCreationTokens)}
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {formatTokens(row.cacheReadTokens)}
      </td>
      <td className="px-2 py-1">
        <div
          className="flex items-center gap-2"
          style={{ minWidth: 120 }}
        >
          <div
            className="flex-1"
            style={{
              position: "relative",
              height: 6,
              background: "var(--bg-h)",
              border: "1px solid var(--bd)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              data-testid={`cache-hit-bar-${row.model}`}
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--acc)",
                transition: "width .2s",
              }}
            />
          </div>
          <span
            className="t-mono-xs"
            style={{ color: "var(--t2)", minWidth: 36, textAlign: "right" }}
          >
            {pct}%
          </span>
        </div>
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {formatCost(row.totalCost)}
      </td>
    </tr>
  );
}
