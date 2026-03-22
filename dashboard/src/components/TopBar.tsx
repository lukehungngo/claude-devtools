import React from "react";
import {
  Sun,
  Moon,
  RefreshCw,
  Clock,
  Server,
  Wrench,
  Radio,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";
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

const toolDescriptions: Record<string, string> = {
  Read: "Read file contents from disk",
  Edit: "Edit/modify existing files",
  Write: "Create or overwrite files",
  Bash: "Execute shell commands",
  Grep: "Search file contents with regex",
  Glob: "Find files by name pattern",
  Agent: "Launch sub-agents for parallel work",
  TaskCreate: "Create todo/task items",
  TaskUpdate: "Update task status",
  TaskGet: "Get task details",
  TaskList: "List all tasks",
};

export function TopBar({ usage, costs, metrics }: Props) {
  const { theme, toggleTheme } = useTheme();

  const tIn = metrics?.tokens.inputTokens ?? 0;
  const tOut = metrics?.tokens.outputTokens ?? 0;
  const sCost = metrics?.tokens.totalCost ?? 0;

  const mcpCount = metrics
    ? new Set(metrics.tools.filter((t) => t.isMcp).map((t) => t.mcpServer)).size
    : 0;

  return (
    <div className="grid grid-cols-[280px_1fr_420px] h-full text-[11px] border-b border-gray-200 dark:border-gray-800">
      {/* LEFT — Title */}
      <div className="flex items-center border-r border-gray-200 dark:border-gray-800 px-4">
        <span className="font-bold text-base">Claude DevTools</span>
        <button
          onClick={toggleTheme}
          className="ml-auto p-1 rounded hover:bg-gray-800 transition shrink-0"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* CENTER — Session data */}
      <div className="flex flex-col justify-center px-5 gap-2 border-r border-gray-200 dark:border-gray-800">
        {metrics ? (
          <>
            {/* Row 1: Session tokens + session info badges */}
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-gray-400 text-xs">Token In:</span>
                <span className="font-bold font-mono text-sm text-white">
                  {formatTokens(tIn)}
                </span>
                <span className="text-gray-400 text-xs">, Out:</span>
                <span className="font-bold font-mono text-sm text-white">
                  {formatTokens(tOut)}
                </span>
              </div>
              <span className="relative group">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-600 text-[9px] text-gray-500 cursor-help">
                  i
                </span>
                <span className="absolute left-1/2 -translate-x-1/2 top-6 z-50 hidden group-hover:block whitespace-nowrap px-2.5 py-1.5 rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 shadow-lg pointer-events-none">
                  Estimated API key usage: ~{formatCost(sCost)}
                </span>
              </span>
              <div className="h-4 w-px bg-gray-700 mx-1" />
              <span className="text-gray-400 text-xs">Mode:</span>
              <span className="text-yellow-400 font-medium text-xs">
                {metrics.session.permissionMode === "default"
                  ? "defaultPermissions"
                  : metrics.session.permissionMode || "—"}
              </span>
              <Dot />
              <span className="text-gray-400 text-xs">Model:</span>
              <span className="text-blue-400 font-medium text-xs">
                {metrics.models[0] ? formatModelName(metrics.models[0]) : "—"}
              </span>
              <Dot />
              <span className="text-gray-400 text-xs">Branch:</span>
              <span className="text-green-400 font-medium text-xs">
                {metrics.session.gitBranch
                  ? `git:${metrics.session.gitBranch}`
                  : "—"}
              </span>
              {metrics.hasRemoteControl && (
                <>
                  <Dot />
                  <Radio size={11} className="text-purple-400" />
                  <span
                    className="text-purple-400 font-medium text-xs"
                    title="Remote control is active"
                  >
                    RC
                  </span>
                </>
              )}
            </div>

            {/* Row 2: Duration + Context + MCPs + Tasks */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-gray-400" />
                <span className="text-gray-200 font-mono text-xs font-medium">
                  {formatDuration(metrics.duration)}
                </span>
              </div>
              <div className="h-3 w-px bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">Context</span>
                <ContextBar percent={metrics.contextPercent} />
              </div>
              <div className="h-3 w-px bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Server size={11} className="text-gray-400" />
                <span className="text-gray-200 text-xs">{mcpCount} MCPs</span>
              </div>
              {metrics.tasks.total > 0 && (
                <>
                  <div className="h-3 w-px bg-gray-700" />
                  <div
                    className="flex items-center gap-1.5 cursor-help"
                    title={`${metrics.tasks.completed} completed, ${metrics.tasks.inProgress} in progress, ${metrics.tasks.pending} pending`}
                  >
                    <span className="text-gray-400 text-xs">Tasks</span>
                    <span className="font-mono text-xs text-gray-200">
                      {metrics.tasks.completed}/{metrics.tasks.total}
                    </span>
                    {metrics.tasks.completed === metrics.tasks.total &&
                      metrics.tasks.total > 0 && (
                        <span className="text-green-400 text-[10px]">
                          ✓ all done
                        </span>
                      )}
                  </div>
                </>
              )}
            </div>

            {/* Row 3: Tool usage with tooltips */}
            <div className="flex items-center gap-2 flex-wrap">
              <Wrench size={11} className="text-gray-500" />
              {metrics.tools.slice(0, 8).map((t) => {
                const shortName = t.name.startsWith("mcp__")
                  ? t.name.split("__").pop() || t.name
                  : t.name;
                const desc =
                  toolDescriptions[shortName] ||
                  (t.isMcp
                    ? `MCP tool from ${t.mcpServer}`
                    : `Tool: ${shortName}`);
                return (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-0.5 cursor-help text-xs"
                    title={`${desc}\n${t.count} calls, ${t.errors} errors`}
                  >
                    <span className="text-green-400">✓</span>
                    <span className="text-cyan-300">{shortName}</span>
                    <span className="text-gray-500 font-mono">×{t.count}</span>
                  </span>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Tag>Session</Tag>
            <span className="text-gray-500 text-xs">
              Select a session from the sidebar
            </span>
          </div>
        )}
      </div>

      {/* RIGHT — Global data (24h/7d tokens + subscription) */}
      <div className="flex flex-col justify-center px-4 gap-1.5 overflow-hidden">
        {/* Row 1: 24h tokens */}
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
        </div>

        {/* Row 2: 7d tokens */}
        <div className="flex items-center gap-2">
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
                    label="5h"
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
    </div>
  );
}

/* --- Reusable pieces --- */

function Dot() {
  return <span className="text-gray-600">|</span>;
}

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

function ContextBar({ percent }: { percent: number }) {
  const color =
    percent > 80
      ? "bg-red-500"
      : percent > 50
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-xs text-gray-200 font-medium">
        {percent}%
      </span>
    </div>
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
    <div
      className="flex items-center gap-1"
      title={resetStr ? `Resets in ${resetStr}` : undefined}
    >
      <RefreshCw size={9} className="text-gray-500" />
      <span className="text-gray-400 text-[10px]">{label}</span>
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        {available && (
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="font-mono text-[10px] text-gray-300">
        {available ? `${pct}%` : "N/A"}
      </span>
    </div>
  );
}
