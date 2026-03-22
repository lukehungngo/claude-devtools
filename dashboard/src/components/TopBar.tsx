import React from "react";
import { Sun, Moon, RefreshCw } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { formatCost, formatTokens } from "../lib/cost";
import type { UsageInfo, CostSummary, SessionMetrics } from "../lib/types";

interface Props {
  usage: UsageInfo | null;
  costs: CostSummary | null;
  metrics: SessionMetrics | null;
}

function formatModelName(model: string): string {
  const stripped = model.replace("claude-", "");
  for (const family of ["opus", "sonnet", "haiku"]) {
    if (stripped.startsWith(family)) {
      const rest = stripped.slice(family.length + 1);
      const ver = rest
        .split("-")
        .filter((p) => /^\d+$/.test(p))
        .slice(0, 2)
        .join(".");
      return `${family} ${ver}`;
    }
  }
  return stripped;
}

function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm > 0 ? `${hrs}h${rm}m` : `${hrs}h`;
}

export function TopBar({ usage, costs, metrics }: Props) {
  const { theme, toggleTheme } = useTheme();

  const tIn = metrics?.tokens.inputTokens ?? 0;
  const tOut = metrics?.tokens.outputTokens ?? 0;
  const sCost = metrics?.tokens.totalCost ?? 0;

  return (
    <div className="grid grid-cols-[280px_1fr_320px] h-full text-[11px] border-b border-gray-200 dark:border-gray-800">
      {/* LEFT — Title (aligned with left sidebar) */}
      <div className="flex items-center justify-center border-r border-gray-200 dark:border-gray-800 px-4">
        <span className="font-bold text-base">Claude DevTools</span>
        <button
          onClick={toggleTheme}
          className="ml-auto p-1 rounded hover:bg-gray-800 transition shrink-0"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* CENTER — Token info (aligned with main content) */}
      <div className="flex flex-col justify-center px-5 gap-1.5 border-r border-gray-200 dark:border-gray-800">
        {/* Row 1: Session */}
        <div className="flex items-center gap-2">
          <Tag>Session</Tag>
          {metrics ? (
            <TokenLine
              tIn={tIn}
              tOut={tOut}
              cost={sCost}
              costLabel="Estimated API key usage for this session"
            />
          ) : (
            <span className="text-gray-500">No session selected</span>
          )}
        </div>

        {/* Row 2: 24h + 7d */}
        <div className="flex items-center gap-2">
          <Tag>24h</Tag>
          {costs ? (
            <TokenLine
              tIn={costs.tokenIn24h}
              tOut={costs.tokenOut24h}
              cost={costs.cost24h}
              costLabel={`Estimated API key usage (${costs.sessionCount24h} sessions)`}
            />
          ) : (
            <span className="text-gray-500">...</span>
          )}
          <div className="h-3.5 w-px bg-gray-700 mx-2" />
          <Tag>7d</Tag>
          {costs ? (
            <TokenLine
              tIn={costs.tokenIn7d}
              tOut={costs.tokenOut7d}
              cost={costs.cost7d}
              costLabel={`Estimated API key usage (${costs.sessionCount7d} sessions)`}
            />
          ) : (
            <span className="text-gray-500">...</span>
          )}
        </div>

        {/* Row 3: Subscription */}
        <div className="flex items-center gap-2">
          <Tag>Subscription</Tag>
          {usage ? (
            <>
              {usage.planName && (
                <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-purple-600 text-white">
                  {usage.planName}
                </span>
              )}
              {usage.fiveHour.utilization !== null ||
              usage.sevenDay.utilization !== null ? (
                <>
                  <UsageBar
                    label="Current session"
                    value={usage.fiveHour.utilization}
                    resetsAt={usage.fiveHour.resetsAt}
                  />
                  <UsageBar
                    label="7d"
                    value={usage.sevenDay.utilization}
                    resetsAt={usage.sevenDay.resetsAt}
                  />
                </>
              ) : (
                <span className="text-gray-500 text-[10px]">
                  Usage data temporarily unavailable (rate limited)
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-500">Not available</span>
          )}
        </div>
      </div>

      {/* RIGHT — Session metadata (aligned with right sidebar) */}
      <div className="flex flex-col justify-center px-4 gap-1.5">
        {metrics ? (
          <>
            <div className="flex items-center gap-2">
              <Tag>Permission</Tag>
              <span className="text-yellow-400 font-medium">
                {metrics.session.permissionMode === "default"
                  ? "defaultPermissions"
                  : metrics.session.permissionMode || "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag>Model</Tag>
              <span className="text-blue-400 font-medium">
                {metrics.models[0] ? formatModelName(metrics.models[0]) : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag>Git</Tag>
              <span className="text-green-400 font-medium">
                {metrics.session.gitBranch || "—"}
              </span>
            </div>
          </>
        ) : (
          <span className="text-gray-500 text-xs">No session</span>
        )}
      </div>
    </div>
  );
}

/* --- Reusable pieces --- */

function TokenLine({
  tIn,
  tOut,
  cost,
  costLabel,
}: {
  tIn: number;
  tOut: number;
  cost: number;
  costLabel: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">Token In:</span>
      <span className="font-semibold font-mono">{formatTokens(tIn)}</span>
      <span className="text-gray-400">, Out:</span>
      <span className="font-semibold font-mono">{formatTokens(tOut)}</span>
      <span className="relative group ml-1">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-600 text-[9px] text-gray-500 cursor-help">
          i
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 top-5 z-50 hidden group-hover:block whitespace-nowrap px-2 py-1 rounded bg-gray-900 border border-gray-700 text-[11px] text-gray-200 shadow-lg pointer-events-none">
          {costLabel}: ~{formatCost(cost)}
        </span>
      </span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] font-medium shrink-0 min-w-[80px]">
      {children}
    </span>
  );
}

function UsageBar({
  label,
  value,
  resetsAt,
}: {
  label: string;
  value: number | null;
  resetsAt: string | null;
}) {
  const available = value !== null;
  const pct = value ?? 0;
  const color =
    pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";
  const resetStr = resetsAt ? formatResetTime(resetsAt) : "";

  return (
    <div className="flex items-center gap-1.5">
      <RefreshCw size={10} className="text-gray-500" />
      <span className="text-gray-400">{label}</span>
      <div className="w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        {available && (
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="font-mono text-gray-300">
        {available ? `${pct}%` : "N/A"}
      </span>
      {resetStr && (
        <span className="text-gray-500 text-[10px]">reset {resetStr}</span>
      )}
    </div>
  );
}
