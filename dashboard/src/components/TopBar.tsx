import { Home, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";
import type { SessionMetrics, EffortLevel } from "../lib/types";
import type { PermissionMode } from "./conversation/permissionModeTypes";
import { cyclePermissionMode } from "./conversation/PermissionModeBadge";
import { ControlsZone } from "./controls/ControlsZone";
import type { ModelOption } from "./controls/ModelSwitcher";

interface Props {
  metrics: SessionMetrics | null;
  isLive?: boolean;
  hasPermissionPending?: boolean;
  viewingTurnNumber?: number;
  onClearViewingTurn?: () => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  // P5-01 control props
  availableModels?: ModelOption[];
  fastMode?: boolean;
  effort?: EffortLevel;
  onModelSelect?: (modelId: string) => void;
  onFastToggle?: () => void;
  onEffortChange?: (level: EffortLevel) => void;
  onCompact?: () => void;
}

const MODE_LABELS: Record<PermissionMode, string> = {
  default: "Default",
  acceptEdits: "Accept Edits",
  plan: "Plan",
  auto: "Auto",
  dontAsk: "Don't Ask",
  bypassPermissions: "YOLO",
};

const MODE_COLORS: Record<PermissionMode, { bg: string; fg: string }> = {
  default: { bg: "var(--bg-h)", fg: "var(--t2)" },
  acceptEdits: { bg: "color-mix(in srgb, var(--amb) 15%, transparent)", fg: "var(--amb)" },
  plan: { bg: "color-mix(in srgb, var(--teal) 15%, transparent)", fg: "var(--teal)" },
  auto: { bg: "color-mix(in srgb, var(--grn) 15%, transparent)", fg: "var(--grn)" },
  dontAsk: { bg: "color-mix(in srgb, var(--amb) 15%, transparent)", fg: "var(--amb)" },
  bypassPermissions: { bg: "color-mix(in srgb, var(--red) 15%, transparent)", fg: "var(--red)" },
};

export function TopBar({ metrics, isLive, hasPermissionPending, viewingTurnNumber, onClearViewingTurn, permissionMode = "default", onPermissionModeChange, availableModels, fastMode, effort, onModelSelect, onFastToggle, onEffortChange, onCompact }: Props) {
  const navigate = useNavigate();
  const tIn = metrics?.tokens.inputTokens ?? 0;
  const tOut = metrics?.tokens.outputTokens ?? 0;
  const sCost = metrics?.tokens.totalCost ?? 0;
  const agentCount = metrics?.totalAgents ?? 0;

  const contextPct = metrics?.contextPercent ?? 0;
  const contextColor =
    contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--amb)" : "var(--grn)";

  // Status: WAIT > LIVE > DONE
  const isWaiting = isLive === true && hasPermissionPending === true;
  const statusLabel = isWaiting ? "WAIT" : isLive ? "LIVE" : "DONE";
  const statusColor = isWaiting ? "var(--amb)" : isLive ? "var(--grn)" : "var(--t3)";

  // Red border when context is at danger level
  const contextDanger = contextPct >= 80;

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
        outline: contextDanger ? "2px solid var(--red)" : "none",
        outlineOffset: -2,
      }}
    >
      {/* Home button */}
      <button
        onClick={() => navigate({ to: "/" })}
        className="flex items-center justify-center shrink-0 cursor-pointer bg-transparent border-none rounded"
        style={{
          width: 28,
          height: 28,
          color: "var(--t2)",
          marginRight: -4,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--acc)";
          (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--t2)";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        title="Back to home"
        data-testid="home-button"
      >
        <Home size={15} />
      </button>

      <HudSep />

      {/* Live status */}
      <div
        className="flex items-center gap-[5px] shrink-0"
        style={{ paddingRight: 12, borderRight: "1px solid var(--bd)" }}
      >
        <div
          data-testid="status-dot"
          className="rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: statusColor,
            animation: isLive ? "pulse 2s infinite" : "none",
          }}
        />
        <span
          className="font-semibold"
          style={{
            fontSize: 10,
            letterSpacing: ".5px",
            color: statusColor,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Permission mode pill */}
      {onPermissionModeChange && (
        <>
          <button
            onClick={() => onPermissionModeChange(cyclePermissionMode(permissionMode))}
            className="shrink-0 cursor-pointer border-none font-mono font-semibold text-[10px] px-2 py-[3px] rounded-lg tracking-wide"
            style={{
              background: MODE_COLORS[permissionMode].bg,
              color: MODE_COLORS[permissionMode].fg,
            }}
            title={`Mode: ${permissionMode}. Click to cycle.`}
          >
            {MODE_LABELS[permissionMode]}
          </button>
          <HudSep />
        </>
      )}

      {viewingTurnNumber != null && (
        <>
          <ViewingTurnPill
            turnNumber={viewingTurnNumber}
            onDismiss={onClearViewingTurn}
          />
          <HudSep />
        </>
      )}

      {metrics ? (
        <>
          {isLive && onModelSelect && availableModels && onFastToggle && effort && onEffortChange && onCompact ? (
            <>
              <ControlsZone
                currentModel={metrics.models[0] ?? null}
                models={availableModels}
                onModelSelect={onModelSelect}
                fastMode={fastMode ?? false}
                onFastToggle={onFastToggle}
                effort={effort}
                onEffortChange={onEffortChange}
                contextPercent={contextPct}
                onCompact={onCompact}
                isLive={isLive}
              />
            </>
          ) : (
            <>
              <HudMetric label="Model" value={modelName} />
              <HudSep />
            </>
          )}
          <HudMetric label="Duration" value={formatDuration(metrics.duration)} />
          <HudSep />

          {/* Context — only show static when controls are NOT active */}
          {!(isLive && onModelSelect) && (
            <>
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
            </>
          )}

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

function ViewingTurnPill({
  turnNumber,
  onDismiss,
}: {
  turnNumber: number;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center shrink-0"
      style={{
        background: "var(--acc-bg)",
        border: "1px solid color-mix(in srgb, var(--acc) 30%, transparent)",
        borderRadius: 10,
        padding: "3px 6px 3px 10px",
        gap: 4,
        animation: "slideDown 200ms ease-out",
      }}
    >
      <span
        className="font-mono font-semibold"
        style={{ fontSize: 10, color: "var(--acc)" }}
      >
        T{turnNumber}
      </span>
      <button
        onClick={onDismiss}
        aria-label={`Stop viewing turn ${turnNumber}, return to latest`}
        className="inline-flex items-center justify-center rounded-full shrink-0 cursor-pointer bg-transparent border-none"
        style={{
          width: 16,
          height: 16,
          color: "var(--t3)",
          padding: 8,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--acc)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
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
