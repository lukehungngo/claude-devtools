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
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm > 0 ? `${hrs}h${rm}m` : `${hrs}h`;
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
    <div className="topbar" style={{
      gridArea: "topbar",
      background: "var(--bg-1)",
      display: "flex",
      flexDirection: "column",
      borderBottom: "1px solid var(--border)",
      zIndex: 10,
      fontFamily: "var(--font)",
      fontSize: "13px",
    }}>
      {/* Row 1: Title | Tokens | Mode | Model | Branch || Right: 24h/7d + Subscription */}
      <div className="topbar-row" style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 20px",
        minHeight: "auto",
        flexWrap: "wrap",
        rowGap: "4px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, flexWrap: "wrap", rowGap: "4px" }}>
          {/* Title */}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "15px",
            color: "var(--text-0)", marginRight: "16px", letterSpacing: "-0.3px", flexShrink: 0,
          }}>
            {metrics && (
              <div style={{
                width: 16, height: 16,
                border: "2px solid var(--border-active)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                animation: metrics.session.isActive ? "spin .8s linear infinite" : undefined,
                opacity: metrics.session.isActive ? 1 : 0.4,
              }} />
            )}
            Claude DevTools
          </div>

          {metrics ? (
            <>
              <TbStat label="Token In" value={formatTokens(tIn)} />
              <TbStat label="Out" value={formatTokens(tOut)} />
              <InfoIcon tooltip={`Estimated API key usage: ~${formatCost(sCost)}`} />
              <TbSep />
              <TbStat label="Mode" value={
                metrics.session.permissionMode === "default"
                  ? "defaultPermissions"
                  : metrics.session.permissionMode || "\u2014"
              } valueColor="var(--yellow)" />
              <TbSep />
              <TbStat label="Model" value={
                metrics.models[0] ? formatModelName(metrics.models[0]) : "\u2014"
              } valueColor="var(--accent)" />
              <TbSep />
              <TbStat label="Branch" value={
                metrics.session.gitBranch
                  ? `git:${metrics.session.gitBranch}`
                  : "\u2014"
              } valueColor="var(--green)" />
            </>
          ) : (
            <span style={{ color: "var(--text-2)", fontSize: "12px" }}>
              Select a session from the sidebar
            </span>
          )}
        </div>

        {/* Right: Subscription box */}
        <div className="tb-sub-box" style={{
          display: "flex", flexDirection: "column", gap: "3px",
          padding: "6px 0 6px 20px",
          borderLeft: "1px solid var(--border)",
          marginLeft: "16px",
          fontSize: "12px",
          flexShrink: 0,
        }}>
          <SubRow label="24h" costs={costs} period="24h" />
          <SubRow label="7d" costs={costs} period="7d" />
          {usage && (
            <div className="tb-sub-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {usage.planName && (
                <span className="tb-sub-badge" style={{
                  padding: "2px 7px", borderRadius: "4px", fontSize: "10px",
                  fontWeight: 700, textTransform: "uppercase",
                  background: "var(--accent)", color: "#fff",
                }}>
                  {usage.planName}
                </span>
              )}
              {(usage.fiveHour.utilization !== null || usage.sevenDay.utilization !== null) ? (
                <>
                  <UsageBar label="5h" value={usage.fiveHour.utilization} resetsAt={usage.fiveHour.resetsAt} />
                  <UsageBar label="7d" value={usage.sevenDay.utilization} resetsAt={usage.sevenDay.resetsAt} />
                </>
              ) : (
                <span style={{ color: "var(--text-2)", fontSize: "10px" }}>
                  Usage data unavailable
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Duration | Context bar | MCP count | Tasks */}
      <div className="topbar-row" style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 20px",
        minHeight: "auto",
        flexWrap: "wrap",
        rowGap: "4px",
        borderBottom: "1px solid var(--border)",
      }}>
        {metrics ? (
          <>
            <TbStat label="Duration" value={formatDuration(metrics.duration)} />
            <TbSep />
            <div className="tb-stat" style={{ display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", fontSize: "13px" }}>
              <span style={{ color: "var(--text-2)" }}>Context</span>
              <div style={{
                display: "flex", alignItems: "center", gap: "4px",
              }}>
                <div style={{
                  width: 70, height: 5,
                  background: "var(--bg-4)",
                  borderRadius: 2,
                  overflow: "hidden",
                  position: "relative",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${metrics.contextPercent}%`,
                    background: contextColor,
                    borderRadius: 2,
                    position: "absolute",
                    left: 0,
                    top: 0,
                  }} />
                </div>
                <span style={{ color: "var(--text-0)", fontWeight: 600 }}>
                  {metrics.contextPercent}%
                </span>
              </div>
            </div>
            <TbSep />
            <TbStat label="MCP" value={`${mcpCount}`} valueColor="var(--cyan)" />
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
          <span style={{ color: "var(--text-2)", fontSize: "12px" }}>&mdash;</span>
        )}
      </div>

      {/* Row 3: Tool usage badges */}
      <div className="topbar-row" style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 20px",
        minHeight: "auto",
        flexWrap: "wrap",
        rowGap: "4px",
      }}>
        {metrics ? (
          metrics.tools.slice(0, 10).map((t) => {
            const shortName = t.name.startsWith("mcp__")
              ? t.name.split("__").pop() || t.name
              : t.name;
            const checkColor = toolColorMap[shortName] || "var(--text-1)";
            return (
              <span
                key={t.name}
                className="tb-tool"
                onClick={() => onToolFilter?.(shortName)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "3px",
                  fontSize: "12px",
                  color: "var(--text-1)",
                  whiteSpace: "nowrap",
                  marginRight: "6px",
                  cursor: "pointer",
                }}
                title={`${shortName}: ${t.count} calls, ${t.errors} errors — click to filter log`}
              >
                <span style={{ color: checkColor, marginRight: "1px" }}>&#10003;</span>
                <span>{shortName}</span>
                <span style={{ color: "var(--text-2)", fontFamily: "var(--font)" }}>
                  &times;{t.count}
                </span>
              </span>
            );
          })
        ) : (
          <span style={{ color: "var(--text-2)", fontSize: "12px" }}>&mdash;</span>
        )}
      </div>
    </div>
  );
}

/* --- Reusable pieces --- */

function TbSep() {
  return (
    <div className="tb-sep" style={{
      width: 1, height: 16,
      background: "var(--border)",
      margin: "0 12px",
      flexShrink: 0,
    }} />
  );
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
    <div className="tb-stat" style={{
      display: "flex", alignItems: "center", gap: "5px",
      color: "var(--text-2)", whiteSpace: "nowrap", fontSize: "13px",
    }}>
      <span className="label" style={{ color: "var(--text-2)" }}>{label}</span>
      <span className="val" style={{
        color: valueColor || "var(--text-0)",
        fontWeight: 600,
      }}>
        {value}
      </span>
    </div>
  );
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      className="info-icon"
      style={{
        width: 14, height: 14, borderRadius: "50%",
        border: "1px solid var(--text-2)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: "9px", color: "var(--text-2)",
        cursor: "help", marginLeft: "2px",
      }}
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
    <div className="tb-sub-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span className="tb-sub-label" style={{ color: "var(--text-2)", minWidth: "24px" }}>
        {label}
      </span>
      {costs ? (
        <span className="tb-sub-val" style={{ color: "var(--text-0)" }}>
          In: {formatTokens(tIn ?? 0)} Out: {formatTokens(tOut ?? 0)}
        </span>
      ) : (
        <span style={{ color: "var(--text-2)" }}>...</span>
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

  return (
    <div
      className="tb-usage-bar"
      style={{
        display: "flex", alignItems: "center", gap: "5px",
        fontSize: "11px", color: "var(--text-2)",
      }}
      title={resetStr ? `Resets in ${resetStr}` : undefined}
    >
      <span>{label}</span>
      <div style={{
        width: 40, height: 4,
        background: "var(--bg-4)",
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
      }}>
        {value !== null && (
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: barColor,
            borderRadius: 2,
            position: "absolute",
            left: 0, top: 0,
          }} />
        )}
      </div>
      <span style={{ fontFamily: "var(--font)", fontSize: "10px", color: "var(--text-1)" }}>
        {value !== null ? `${pct}%` : "N/A"}
      </span>
    </div>
  );
}
