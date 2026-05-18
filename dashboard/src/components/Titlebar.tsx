import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTheme } from "../contexts/ThemeContext";
import type { UsageInfo } from "../lib/types";

interface TitlebarProps {
  usage?: UsageInfo | null;
  onOpenDrawer?: () => void;
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

export function Titlebar({ usage, onOpenDrawer }: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const isInsights = location.pathname === "/insights";
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

      {/* Nav pill — Session · Insights */}
      <div
        data-testid="nav-pill"
        className="flex items-center gap-1 bg-dt-bg2 border border-dt-border rounded-full p-1 shrink-0"
      >
        <button
          type="button"
          data-testid="nav-session"
          aria-current={!isInsights ? ("page" as const) : undefined}
          onClick={() => navigate({ to: "/" })}
          className={[
            "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
            !isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
          ].join(" ")}
        >
          Session
        </button>
        <button
          type="button"
          data-testid="nav-insights"
          aria-current={isInsights ? ("page" as const) : undefined}
          onClick={() => navigate({ to: "/insights" })}
          className={[
            "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
            isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
          ].join(" ")}
        >
          Insights
        </button>
      </div>

      {/* tb-sep: vertical divider between brand and pills */}
      <span
        data-testid="tb-sep"
        style={{
          width: '1px',
          height: '18px',
          background: 'var(--bd)',
          margin: '0 4px',
          flexShrink: 0,
        }}
      />

      {/* Plan badge */}
      {usage?.planName && (
        <span style={{ color: "var(--t1)", fontWeight: 600, fontSize: "11px", flexShrink: 0 }}>
          {usage.planName}
        </span>
      )}

      {/* Usage pill — single grouped button */}
      {(sessionPct != null || ratePct != null) && (
        <button
          type="button"
          aria-label="Usage"
          onClick={onOpenDrawer}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "3px 10px",
            background: "transparent",
            border: "1px solid var(--bd)",
            borderRadius: "var(--r)",
            height: "24px",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-e)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          {sessionPct != null && (
            <>
              <UsageMeter label="5h" pct={sessionPct} countdown={sessionCountdown} barWidth={60} />
              {ratePct != null && (
                <span style={{ width: "1px", height: "12px", background: "var(--bd)", flexShrink: 0 }} />
              )}
            </>
          )}
          {ratePct != null && (
            <UsageMeter label="7d" pct={ratePct} countdown={rateCountdown} barWidth={60} />
          )}
        </button>
      )}

      {/* Spacer — keeps theme/avatar right-aligned */}
      <span style={{ flex: 1 }} />

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
      <button
        type="button"
        aria-label="Profile"
        onClick={onOpenDrawer}
        className="flex items-center justify-center shrink-0"
        style={{
          width: 26, height: 26, borderRadius: "50%",
          border: "1px solid var(--bd)",
          background: "linear-gradient(135deg, var(--acc), var(--pur))",
          color: "#fff", fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          cursor: "pointer", position: "relative", marginLeft: 4,
          padding: 0,
        }}
        title="Profile"
      >
        LH
        <span
          style={{
            position: "absolute", top: -2, right: -2,
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--grn)", border: "1.5px solid var(--bg-s)",
          }}
        />
      </button>
    </div>
  );
}

function UsageMeter({
  label,
  pct,
  countdown,
  barWidth,
}: {
  label: string;
  pct: number;
  countdown: string | null;
  barWidth: number;
}) {
  const barColor = pct >= 90 ? "var(--red)" : "var(--amb)";

  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 4 }}
    >
      <span
        className="font-mono"
        style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".2px" }}
      >
        {label}
      </span>
      <div
        style={{
          width: barWidth,
          height: "4px",
          background: "var(--bg-e)",
          border: "1px solid var(--bd)",
          borderRadius: "2px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            background: barColor,
          }}
        />
      </div>
      <span
        style={{ color: "var(--t1)", fontWeight: 600, fontSize: "11px" }}
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
