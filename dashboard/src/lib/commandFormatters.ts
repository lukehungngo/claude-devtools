import { formatCost, formatTokens, formatDuration } from "./cost";
import type { SessionMetrics, UsageInfo, CostSummary } from "./types";

/**
 * Format the output for /cost command.
 * Returns a multi-line string with total cost, tokens, per-model breakdown, and duration.
 */
export function formatCostCommand(metrics: SessionMetrics | null): string {
  if (!metrics) {
    return "No session data available. Open a session to see costs.";
  }

  const { tokens, tokensByModel, duration } = metrics;
  const lines: string[] = [];

  lines.push(`Total: ${formatCost(tokens.totalCost)} | In: ${formatTokens(tokens.inputTokens)} | Out: ${formatTokens(tokens.outputTokens)} | Duration: ${formatDuration(duration)}`);

  const modelEntries = Object.entries(tokensByModel);
  if (modelEntries.length > 0) {
    for (const [model, usage] of modelEntries) {
      // Extract short model name (e.g., "claude-sonnet-4-6" -> "sonnet")
      const shortName = model
        .replace("claude-", "")
        .replace(/-\d[\d-]*/g, "")
        .trim() || model;
      lines.push(`  ${shortName}: ${formatCost(usage.totalCost)} (in: ${formatTokens(usage.inputTokens)}, out: ${formatTokens(usage.outputTokens)})`);
    }
  }

  return lines.join("\n");
}

/**
 * Format the output for /usage command.
 * Returns a multi-line string with 5h/7d utilization, reset times, and plan name.
 */
export function formatUsageCommand(usage: UsageInfo | null): string {
  if (!usage) {
    return "No usage data available. Rate limit info may not be supported.";
  }

  const lines: string[] = [];

  if (usage.planName) {
    lines.push(`Plan: ${usage.planName}`);
  }

  const fiveHourPct = usage.fiveHour.utilization !== null
    ? `${Math.round(usage.fiveHour.utilization * 100)}%`
    : "N/A";
  const fiveHourReset = usage.fiveHour.resetsAt
    ? ` (resets ${formatResetTime(usage.fiveHour.resetsAt)})`
    : "";
  lines.push(`5-hour: ${fiveHourPct}${fiveHourReset}`);

  const sevenDayPct = usage.sevenDay.utilization !== null
    ? `${Math.round(usage.sevenDay.utilization * 100)}%`
    : "N/A";
  const sevenDayReset = usage.sevenDay.resetsAt
    ? ` (resets ${formatResetTime(usage.sevenDay.resetsAt)})`
    : "";
  lines.push(`7-day: ${sevenDayPct}${sevenDayReset}`);

  return lines.join("\n");
}

/**
 * Data shape returned by the /permissions-info server endpoint.
 */
export interface PermissionsInfo {
  mode: string;
  allowances: string[];
  pendingCount: number;
}

/**
 * Format the output for /context command.
 * Returns a multi-line string with context usage %, window size, estimated tokens, and status.
 */
export function formatContextCommand(metrics: SessionMetrics | null): string {
  if (!metrics) {
    return "No session data available. Open a session to see context info.";
  }

  const { contextPercent, contextWindowSize } = metrics;
  const estimatedUsed = Math.round((contextPercent / 100) * contextWindowSize);

  const status =
    contextPercent > 90
      ? "CRITICAL"
      : contextPercent >= 70
        ? "WARNING"
        : "OK";

  const lines: string[] = [];
  lines.push(`Context: ${contextPercent}% used | Status: ${status}`);
  lines.push(`Window: ${formatTokens(contextWindowSize)} tokens | Used: ~${formatTokens(estimatedUsed)} tokens`);

  return lines.join("\n");
}

/**
 * Format the output for /permissions command.
 * Returns a multi-line string with mode, allowances, and pending count.
 */
export function formatPermissionsCommand(info: PermissionsInfo | null): string {
  if (!info) {
    return "No permission data available.";
  }

  const lines: string[] = [];
  lines.push(`Mode: ${info.mode}`);
  lines.push(`Session allowances: ${info.allowances.length > 0 ? info.allowances.join(", ") : "none"}`);
  lines.push(`Pending requests: ${info.pendingCount} pending`);

  return lines.join("\n");
}

/**
 * Format the output for /diff command.
 * Fetches git diff stat from the server for the session's cwd.
 */
export async function formatDiffCommand(
  projectHash: string | undefined,
  sessionId: string | undefined
): Promise<string> {
  if (!projectHash || !sessionId) {
    return "No session selected.";
  }

  try {
    const res = await fetch(`/api/sessions/${projectHash}/${sessionId}/git-diff`);
    const data = await res.json();
    const stat = (data.stat as string) || "";
    const diff = (data.diff as string) || "";

    if (!stat && !diff) {
      return "No uncommitted changes.";
    }

    // Show stat summary followed by full diff
    const parts: string[] = [];
    if (stat) parts.push(stat.trimEnd());
    if (diff) parts.push(diff.trimEnd());
    return parts.join("\n\n");
  } catch {
    return "Failed to fetch git diff.";
  }
}

/**
 * Format the output for /mcp command.
 * Groups MCP tools by server and shows tool counts.
 */
export function formatMcpCommand(metrics: SessionMetrics | null): string {
  if (!metrics) {
    return "No MCP servers connected.";
  }

  const mcpTools = metrics.tools.filter((t) => t.isMcp && t.mcpServer);
  if (mcpTools.length === 0) {
    return "No MCP servers connected.";
  }

  const serverMap = new Map<string, number>();
  for (const tool of mcpTools) {
    const server = tool.mcpServer!;
    serverMap.set(server, (serverMap.get(server) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`MCP Servers (${serverMap.size}):`);
  for (const [server, count] of serverMap) {
    lines.push(`  ${server}: ${count} tool${count !== 1 ? "s" : ""}`);
  }

  return lines.join("\n");
}

/**
 * Format the output for /tasks command.
 * Returns a multi-line string with task summary (total, completed, in progress, pending).
 */
export function formatTasksCommand(metrics: SessionMetrics | null): string {
  if (!metrics) {
    return "No session data available. Open a session to see tasks.";
  }

  const { tasks } = metrics;
  if (tasks.total === 0) {
    return "No tasks in this session.";
  }

  const lines: string[] = [];
  lines.push(`Tasks: ${tasks.completed}/${tasks.total}`);
  lines.push(`  ${tasks.completed} completed | ${tasks.inProgress} in progress | ${tasks.pending} pending`);

  return lines.join("\n");
}

/**
 * Format the output for /analytics command.
 * Returns a multi-line string with cross-session analytics: session counts, costs, tokens, avg cost.
 */
export function formatAnalyticsCommand(costs: CostSummary | null): string {
  if (!costs) {
    return "No analytics data available. Cost aggregation may not be supported.";
  }

  const lines: string[] = [];

  lines.push(`Sessions: ${costs.sessionCount24h} sessions (24h) | ${costs.sessionCount7d} sessions (7d)`);
  lines.push(`Cost: ${formatCost(costs.cost24h)} (24h) | ${formatCost(costs.cost7d)} (7d)`);
  lines.push(`Tokens 24h: In ${formatTokens(costs.tokenIn24h)} | Out ${formatTokens(costs.tokenOut24h)}`);

  const avg24h = costs.sessionCount24h > 0
    ? formatCost(costs.cost24h / costs.sessionCount24h)
    : "$0.00";
  lines.push(`Avg/session (24h): ${avg24h}`);

  return lines.join("\n");
}

function formatResetTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
}
