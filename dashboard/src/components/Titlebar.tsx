import { Sun, Moon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "../contexts/ThemeContext";
import type { UsageInfo } from "../lib/types";

interface TitlebarProps {
  isConnected?: boolean;
  wsLatency?: number | null;
  usage?: UsageInfo | null;
}

export function Titlebar({ isConnected, wsLatency, usage }: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const sessionPct = usage?.fiveHour.utilization ?? null;
  const ratePct = usage?.sevenDay.utilization ?? null;

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
        <div
          className="flex items-center shrink-0"
          style={{
            gap: 5,
            padding: "2px 8px",
            borderRadius: 10,
            background: isConnected ? "var(--grn-bg)" : "var(--red-bg)",
            marginLeft: 4,
          }}
          title="WebSocket connection status"
        >
          <div
            className="rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              background: isConnected ? "var(--grn)" : "var(--red)",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: isConnected ? "var(--grn)" : "var(--red)",
              letterSpacing: ".2px",
            }}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {isConnected && wsLatency != null && (
            <span
              className="font-mono"
              style={{ fontSize: 9, color: "var(--grn)", opacity: 0.75 }}
            >
              {wsLatency}ms
            </span>
          )}
        </div>
      )}

      {/* Center: usage meters */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {sessionPct != null && (
          <UsageMeter label="5h" pct={sessionPct} resetsAt={usage?.fiveHour.resetsAt} />
        )}
        {ratePct != null && (
          <UsageMeter label="7d" pct={ratePct} resetsAt={usage?.sevenDay.resetsAt} />
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
}: {
  label: string;
  pct: number;
  resetsAt: string | null | undefined;
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
    </div>
  );
}
