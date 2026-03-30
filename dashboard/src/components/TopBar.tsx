import { formatCost, formatTokens, formatDuration } from "../lib/cost";
import type { SessionMetrics } from "../lib/types";
import { ThemePicker } from "./ThemePicker";

interface Props {
  metrics: SessionMetrics | null;
  isLive?: boolean;
}

export function TopBar({ metrics, isLive }: Props) {
  const tIn = metrics?.tokens.inputTokens ?? 0;
  const tOut = metrics?.tokens.outputTokens ?? 0;
  const sCost = metrics?.tokens.totalCost ?? 0;
  const agentCount = metrics?.totalAgents ?? 0;

  const contextPct = metrics?.contextPercent ?? 0;
  const contextColor =
    contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--amb)" : "var(--grn)";

  const modelName = metrics?.models[0]
    ? formatModelShort(metrics.models[0])
    : "\u2014";

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: "0 18px",
        height: 40,
        background: "var(--bg-s)",
        borderBottom: "1px solid var(--bd)",
        gap: 14,
      }}
    >
      {/* Live status */}
      <div
        className="flex items-center gap-[5px] shrink-0"
        style={{ paddingRight: 12, borderRight: "1px solid var(--bd)" }}
      >
        <div
          className="rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: isLive ? "var(--grn)" : "var(--t3)",
            animation: isLive ? "pulse 2s infinite" : "none",
          }}
        />
        <span
          className="font-semibold"
          style={{
            fontSize: 10,
            letterSpacing: ".5px",
            color: isLive ? "var(--grn)" : "var(--t3)",
          }}
        >
          {isLive ? "LIVE" : "DONE"}
        </span>
      </div>

      {metrics ? (
        <>
          <HudMetric label="Model" value={modelName} />
          <HudSep />
          <HudMetric label="Duration" value={formatDuration(metrics.duration)} />
          <HudSep />

          {/* Context with mini bar */}
          <div className="flex flex-col items-center gap-[2px]">
            <span
              className="uppercase"
              style={{ fontSize: 8, color: "var(--t3)", letterSpacing: ".4px" }}
            >
              Context
            </span>
            <div className="flex items-center gap-1">
              <span
                className="font-mono font-medium"
                style={{ fontSize: 12, color: "var(--t1)" }}
              >
                {contextPct}%
              </span>
              <div
                style={{
                  width: 42,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--bd)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${contextPct}%`,
                    borderRadius: 2,
                    background: contextColor,
                    transition: "width .3s, background .3s",
                  }}
                />
              </div>
            </div>
          </div>

          <HudSep />
          <HudMetric label="Cost" value={formatCost(sCost)} valueColor="var(--amb)" />
          <HudSep />
          <HudMetric label="Agents" value={String(agentCount)} />

          {/* Tokens (right-aligned) */}
          <div className="flex gap-2 ml-auto">
            <div className="flex flex-col items-center gap-[2px]">
              <span
                className="uppercase"
                style={{ fontSize: 8, color: "var(--t3)", letterSpacing: ".4px" }}
              >
                In
              </span>
              <span
                className="font-mono font-medium"
                style={{ fontSize: 11, color: "var(--teal)" }}
              >
                {formatTokens(tIn)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-[2px]">
              <span
                className="uppercase"
                style={{ fontSize: 8, color: "var(--t3)", letterSpacing: ".4px" }}
              >
                Out
              </span>
              <span
                className="font-mono font-medium"
                style={{ fontSize: 11, color: "var(--pur)" }}
              >
                {formatTokens(tOut)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <span className="flex-1" style={{ fontSize: 12, color: "var(--t3)" }}>
          Select a session from the sidebar
        </span>
      )}

      {/* Theme picker (always visible, far right) */}
      <HudSep />
      <ThemePicker />
    </div>
  );
}

function HudMetric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      <span
        className="uppercase"
        style={{ fontSize: 8, color: "var(--t3)", letterSpacing: ".4px" }}
      >
        {label}
      </span>
      <span
        className="font-mono font-medium"
        style={{ fontSize: 12, color: valueColor || "var(--t1)" }}
      >
        {value}
      </span>
    </div>
  );
}

function HudSep() {
  return (
    <div
      className="shrink-0"
      style={{ width: 1, height: 22, background: "var(--bd)" }}
    />
  );
}

function formatModelShort(model: string): string {
  const stripped = model.replace("claude-", "");
  for (const family of ["opus", "sonnet", "haiku"]) {
    if (stripped.startsWith(family)) {
      const rest = stripped.slice(family.length + 1);
      const ver = rest
        .split("-")
        .filter((p) => /^\d+$/.test(p))
        .slice(0, 2)
        .join(".");
      return `${family.charAt(0).toUpperCase() + family.slice(1)} ${ver}`;
    }
  }
  return stripped;
}
