import { formatCost, formatTokens, formatDuration } from "../lib/cost";
import type { UsageInfo, CostSummary, SessionMetrics } from "../lib/types";

interface Props {
  usage: UsageInfo | null;
  costs: CostSummary | null;
  metrics: SessionMetrics | null;
  onToolFilter?: (toolName: string) => void;
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

  const hoursTotal = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hoursTotal < 24) {
    return remainingMins > 0
      ? `${hoursTotal}h ${remainingMins}m`
      : `${hoursTotal}h`;
  }

  const days = Math.floor(hoursTotal / 24);
  const remainingHours = hoursTotal % 24;
  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
}

const toolColorMap: Record<string, string> = {
  Read: "var(--cyan)",
  Bash: "var(--yellow)",
  Write: "var(--green)",
  Edit: "var(--orange)",
  TaskUpdate: "var(--purple)",
  Grep: "var(--cyan)",
  Glob: "var(--cyan)",
  Agent: "var(--accent)",
  WebFetch: "var(--green)",
};

export function TopBar({ usage, costs, metrics, onToolFilter }: Props) {
  const tIn = metrics?.tokens.inputTokens ?? 0;
  const tOut = metrics?.tokens.outputTokens ?? 0;
  const sCost = metrics?.tokens.totalCost ?? 0;

  const mcpCount = metrics
    ? new Set(metrics.tools.filter((t) => t.isMcp).map((t) => t.mcpServer)).size
    : 0;

  const contextColor =
    (metrics?.contextPercent ?? 0) > 80
      ? "var(--red)"
      : (metrics?.contextPercent ?? 0) > 50
        ? "var(--yellow)"
        : "var(--green)";

  return (
    <div
      className="topbar bg-dt-bg1 flex flex-col border-b border-dt-border z-10 font-mono text-lg"
      style={{ gridArea: "topbar" }}
    >
      {/* Row 1: Title | Tokens | Mode | Model | Branch || Right: 24h/7d + Subscription */}
      <div className="topbar-row flex items-center px-5 min-h-8 flex-nowrap overflow-hidden border-b border-dt-border">
        <div className="flex items-center gap-0 flex-1 flex-nowrap overflow-hidden">
          {/* Title */}
          <div className="flex items-center gap-2 font-sans font-bold text-2xl text-dt-text0 mr-4 tracking-[-0.3px] shrink-0">
            {metrics && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid var(--border-active)",
                  borderTopColor: "var(--accent)",
                  borderRadius: "50%",
                  animation: metrics.session.isActive
                    ? "spin .8s linear infinite"
                    : undefined,
                  opacity: metrics.session.isActive ? 1 : 0.4,
                }}
              />
            )}
            Claude DevTools
          </div>

          {metrics ? (
            <>
              <div className="flex items-center gap-3">
                <TbStat label="Token In" value={formatTokens(tIn)} />
                <div className="flex items-center gap-1">
                  <TbStat label="Out" value={formatTokens(tOut)} />
                  <InfoIcon
                    tooltip={`Estimated API key usage: ~${formatCost(sCost)}`}
                  />
                </div>
              </div>
              <TbSep />
              <TbStat
                label="Mode"
                value={
                  metrics.session.permissionMode === "default"
                    ? "defaultPermissions"
                    : metrics.session.permissionMode || "\u2014"
                }
                valueColor="var(--yellow)"
              />
              <TbSep />
              <TbStat
                label="Model"
                value={
                  metrics.models[0]
                    ? formatModelName(metrics.models[0])
                    : "\u2014"
                }
                valueColor="var(--accent)"
              />
              <TbSep />
              <TbStat
                label="Branch"
                value={
                  metrics.session.gitBranch
                    ? `git:${metrics.session.gitBranch}`
                    : "\u2014"
                }
                valueColor="var(--green)"
              />
            </>
          ) : (
            <span className="text-dt-text2 text-sm">
              Select a session from the sidebar
            </span>
          )}
        </div>

        {/* Right: Subscription box */}
        <div className="tb-sub-box flex flex-col gap-0.75 py-1.5 pl-5 border-l border-dt-border ml-4 text-md shrink-0">
          <SubRow label="24h" costs={costs} period="24h" />
          <SubRow label="7d" costs={costs} period="7d" />
          {usage && (
            <div className="tb-sub-row flex items-center gap-2">
              {usage.planName && (
                <span className="tb-sub-badge px-1.75 py-0.5 rounded-dt-sm text-xxs font-bold uppercase bg-dt-accent text-white">
                  {usage.planName}
                </span>
              )}
              {usage.fiveHour.utilization !== null ||
              usage.sevenDay.utilization !== null ? (
                <>
                  <UsageBar
                    label="Session"
                    value={usage.fiveHour.utilization}
                    resetsAt={usage.fiveHour.resetsAt}
                  />
                  <UsageBar
                    label="Week"
                    value={usage.sevenDay.utilization}
                    resetsAt={usage.sevenDay.resetsAt}
                  />
                </>
              ) : (
                <span className="text-dt-text2 text-xxs">
                  Usage data unavailable
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Duration | Context bar | MCP count | Tasks */}
      <div className="topbar-row flex items-center px-5 min-h-8 flex-nowrap overflow-hidden border-b border-dt-border">
        {metrics ? (
          <>
            <TbStat label="Duration" value={formatDuration(metrics.duration)} />
            <TbSep />
            <div className="tb-stat flex items-center gap-1 whitespace-nowrap text-lg">
              <span className="text-dt-text2">Context</span>
              <div className="flex items-center gap-1">
                <div
                  style={{
                    width: 70,
                    height: 5,
                    background: "var(--bg-4)",
                    borderRadius: 2,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${metrics.contextPercent}%`,
                      background: contextColor,
                      borderRadius: 2,
                      position: "absolute",
                      left: 0,
                      top: 0,
                    }}
                  />
                </div>
                <span className="text-dt-text0 font-semibold">
                  {metrics.contextPercent}%
                </span>
              </div>
            </div>
            <TbSep />
            <TbStat
              label="MCP"
              value={`${mcpCount}`}
              valueColor="var(--cyan)"
            />
            {metrics.tasks.total > 0 && (
              <>
                <TbSep />
                <TbStat
                  label="Tasks"
                  value={`${metrics.tasks.completed}/${metrics.tasks.total}`}
                  valueColor={
                    metrics.tasks.completed === metrics.tasks.total
                      ? "var(--green)"
                      : "var(--text-0)"
                  }
                />
              </>
            )}
          </>
        ) : (
          <span className="text-dt-text2 text-sm">&mdash;</span>
        )}
      </div>

      {/* Row 3: Tool usage badges */}
      <div className="topbar-row flex items-center px-5 min-h-7 flex-nowrap overflow-hidden">
        {metrics ? (
          metrics.tools.slice(0, 10).map((t) => {
            const shortName = t.name.startsWith("mcp__")
              ? t.name.split("__").pop() || t.name
              : t.name;
            const checkColor = toolColorMap[shortName] || "var(--text-1)";
            return (
              <span
                key={t.name}
                onClick={() => onToolFilter?.(shortName)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-dt-xs text-md text-dt-text1 whitespace-nowrap mr-1.5 cursor-pointer"
                title={`${shortName}: ${t.count} calls, ${t.errors} errors — click to filter log`}
              >
                <span style={{ color: checkColor, marginRight: "1px" }}>
                  &#10003;
                </span>
                <span>{shortName}</span>
                <span className="text-dt-text2 font-mono">
                  &times;{t.count}
                </span>
              </span>
            );
          })
        ) : (
          <span className="text-dt-text2 text-sm">&mdash;</span>
        )}
      </div>
    </div>
  );
}

/* --- Reusable pieces --- */

function TbSep() {
  return <div className="tb-sep w-px h-4 bg-dt-border mx-3 shrink-0" />;
}

function TbStat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="tb-stat flex items-center gap-1 whitespace-nowrap text-lg text-dt-text2">
      <span className="label text-dt-text2">{label}</span>
      <span
        className="val"
        style={{
          color: valueColor || "var(--text-0)",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      className="w-3.5 h-3.5 rounded-full border border-dt-text2 inline-flex items-center justify-center text-xs text-dt-text2 cursor-help ml-0.5"
      title={tooltip}
    >
      i
    </span>
  );
}

function SubRow({
  label,
  costs,
  period,
}: {
  label: string;
  costs: CostSummary | null;
  period: "24h" | "7d";
}) {
  const tIn = period === "24h" ? costs?.tokenIn24h : costs?.tokenIn7d;
  const tOut = period === "24h" ? costs?.tokenOut24h : costs?.tokenOut7d;

  return (
    <div className="tb-sub-row flex items-center gap-2">
      <span className="tb-sub-label text-dt-text2 min-w-6">{label}</span>
      {costs ? (
        <span className="tb-sub-val text-dt-text0 flex gap-2">
          <span>In: {formatTokens(tIn ?? 0)}</span>
          <span>Out: {formatTokens(tOut ?? 0)}</span>
        </span>
      ) : (
        <span className="text-dt-text2">...</span>
      )}
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
  const pct = value ?? 0;
  const barColor =
    pct > 80 ? "var(--red)" : pct > 50 ? "var(--yellow)" : "var(--green)";
  const resetStr = resetsAt ? formatResetTime(resetsAt) : "";
  const resetLabel = resetStr ? `reset in ${resetStr}` : "reset unknown";

  return (
    <div
      className="flex items-center gap-1 text-sm text-dt-text2 whitespace-nowrap"
      title={resetStr ? `Resets in ${resetStr}` : undefined}
    >
      <span>{label}</span>
      <div
        style={{
          width: 40,
          height: 4,
          background: "var(--bg-4)",
          borderRadius: 2,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {value !== null && (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 2,
              position: "absolute",
              left: 0,
              top: 0,
            }}
          />
        )}
      </div>
      <span className="font-mono text-xs text-dt-text1">{resetLabel} |</span>
    </div>
  );
}
