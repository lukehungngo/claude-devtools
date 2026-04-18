import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "../contexts/ThemeContext";
import type { UsageInfo } from "../lib/types";

interface TitlebarProps {
  isConnected?: boolean;
  wsLatency?: number | null;
  usage?: UsageInfo | null;
}

export function formatTimeUntil(resetsAt: string | null | undefined, now: number): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - now;
  if (ms <= 0) return null;
  const totalMins = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function Titlebar({ isConnected, wsLatency, usage }: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const sessionPct = usage?.fiveHour.utilization ?? null;
  const ratePct = usage?.sevenDay.utilization ?? null;
  const sessionCountdown = formatTimeUntil(usage?.fiveHour.resetsAt, now);
  const rateCountdown = formatTimeUntil(usage?.sevenDay.resetsAt, now);

  return (
    <div
      className="flex items-center shrink-0 gap-2"
      style={{
        height: "var(--titlebar-h, 38px)",
        background: "var(--bg-s)",
        padding: "0 16px",
        borderBottom: "1px solid var(--bd)",
      }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate({ to: "/" })}
        className="cursor-pointer bg-transparent border-none font-semibold shrink-0"
        style={{ fontSize: 12, color: "var(--acc)", padding: 0, letterSpacing: ".2px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        title="Back to home"
        data-testid="home-button"
      >
        Claude DevTools
      </button>

      {/* Connection pill */}
      {isConnected !== undefined && (
        <button
          type="button"
          aria-label={isConnected ? "Connected — WebSocket connection status" : "Disconnected — WebSocket connection status"}
          title="WebSocket connection status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 10px",
            background: "transparent",
            border: "1px solid var(--bd)",
            borderRadius: "var(--r)",
            height: "24px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            marginLeft: 4,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-e)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          {isConnected ? (
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--grn)",
                boxShadow: "0 0 0 2px var(--grn-bg)",
                animation: "tbcpulse 2.2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--amb)",
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ color: "var(--t1)", fontWeight: 600 }}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {isConnected && wsLatency != null && (
            <span style={{ color: "var(--t3)" }}>{wsLatency}ms</span>
          )}
        </button>
      )}

      {/* Center: plan badge + usage meters */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {usage?.planName && (
          <span style={{ color: "var(--t1)", fontWeight: 600, fontSize: "11px" }}>
            {usage.planName}
          </span>
        )}
        {sessionPct != null && (
          <UsageMeter label="5h" pct={sessionPct} resetsAt={usage?.fiveHour.resetsAt} countdown={sessionCountdown} />
        )}
        {ratePct != null && (
          <UsageMeter label="7d" pct={ratePct} resetsAt={usage?.sevenDay.resetsAt} countdown={rateCountdown} />
        )}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center cursor-pointer shrink-0"
        style={{
          width: 26, height: 26, borderRadius: 6,
          border: "1px solid var(--bd)", background: "transparent",
          color: "var(--t3)", fontSize: 14, transition: "all .15s",
        }}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      {/* Avatar button */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 26, height: 26, borderRadius: "50%",
          border: "1px solid var(--bd)",
          background: "linear-gradient(135deg, var(--acc), var(--pur))",
          color: "#fff", fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          cursor: "pointer", position: "relative", marginLeft: 4,
        }}
        title="Profile"
        role="button"
        aria-label="Profile"
      >
        LH
        <span
          style={{
            position: "absolute", top: -2, right: -2,
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--grn)", border: "1.5px solid var(--bg-s)",
          }}
        />
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  pct,
  resetsAt,
  countdown,
}: {
  label: string;
  pct: number;
  resetsAt: string | null | undefined;
  countdown: string | null;
}) {
  const color = pct > 80 ? "var(--red)" : pct > 50 ? "var(--amb)" : "var(--grn)";
  const title = resetsAt
    ? `Resets at ${new Date(resetsAt).toLocaleTimeString()}`
    : undefined;

  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 4 }}
      title={title}
    >
      <span
        className="font-mono"
        style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".2px" }}
      >
        {label}
      </span>
      <div
        style={{
          width: 28,
          height: 3,
          borderRadius: 2,
          background: "var(--bd)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: "width .3s",
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{ fontSize: 9, color, letterSpacing: ".2px" }}
      >
        {pct}%
      </span>
      {countdown && (
        <span style={{ fontSize: "9px", marginLeft: "2px" }}>
          <span style={{ opacity: 0.7 }}>↻</span> {countdown}
        </span>
      )}
    </div>
  );
}
