import { X } from "lucide-react";
import type { UsageInfo } from "../lib/types";

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  usage?: UsageInfo | null;
}

export function ProfileDrawer({ isOpen, onClose, usage }: ProfileDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: isOpen ? "rgba(0,0,0,.22)" : "rgba(0,0,0,0)",
          pointerEvents: isOpen ? "auto" : "none",
          transition: "background .18s ease",
          zIndex: 40,
        }}
      />

      {/* Drawer panel */}
      <aside
        data-testid="profile-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 340,
          background: "var(--bg-s)",
          borderLeft: "1px solid var(--bd)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform .22s cubic-bezier(.3,.7,.3,1)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 24px rgba(0,0,0,.08)",
        }}
        aria-label="Profile drawer"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--bd)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--acc), var(--pur))",
              color: "#fff", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            LH
          </div>

          {/* Name + email */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>Luke Hungngo</div>
            <div
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              lukeskywalker.blockchain@gmail.com
            </div>
          </div>

          {/* Close */}
          <button
            type="button"
            aria-label="Close profile drawer"
            onClick={onClose}
            style={{
              width: 22, height: 22, borderRadius: "var(--r-xs)",
              background: "transparent", border: "1px solid transparent",
              color: "var(--t2)", fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.background = "var(--bg-e)";
              el.style.borderColor = "var(--bd)";
              el.style.color = "var(--t1)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.background = "transparent";
              el.style.borderColor = "transparent";
              el.style.color = "var(--t2)";
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <DrawerPlanSection usage={usage} />
          <DrawerUsageSection usage={usage} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--bd)",
            flexShrink: 0,
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "var(--r-sm)",
              background: "var(--bg-e)", border: "1px solid var(--bd)",
              color: "var(--t1)", fontFamily: "var(--font-sans)", fontSize: 11,
              fontWeight: 500, cursor: "pointer",
            }}
          >
            Preferences
          </button>
          <button
            type="button"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "var(--r-sm)",
              background: "var(--bg-e)", border: "1px solid var(--bd)",
              color: "var(--red)", fontFamily: "var(--font-sans)", fontSize: 11,
              fontWeight: 500, cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function DrawerPlanSection({ usage }: { usage?: UsageInfo | null }) {
  if (!usage?.planName) return null;

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--bd)" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: ".8px", textTransform: "uppercase", color: "var(--t3)",
          marginBottom: 10,
        }}
      >
        Plan
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, var(--acc-bg), var(--teal-bg))",
          border: "1px solid var(--acc-bg)",
          borderRadius: "var(--r-md, 10px)",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: "var(--r-sm, 6px)",
            background: "var(--acc)", color: "#fff",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: ".5px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {usage.planName.substring(0, 3).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", display: "flex", alignItems: "baseline", gap: 6 }}>
            {usage.planName} plan
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                color: "var(--acc)", background: "#fff",
                padding: "1px 5px", borderRadius: "var(--r-xs, 4px)", letterSpacing: ".4px",
              }}
            >
              5× usage
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t2)", marginTop: 2 }}>
            sonnet-4-6 · opus-4 · haiku-4-5
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerUsageSection({ usage }: { usage?: UsageInfo | null }) {
  if (!usage) return null;

  const circumference = 2 * Math.PI * 30;

  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: ".8px", textTransform: "uppercase", color: "var(--t3)",
          marginBottom: 10,
        }}
      >
        Usage
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 2px" }}>
        {usage.fiveHour.utilization != null && (
          <RingDial
            pct={usage.fiveHour.utilization}
            circumference={circumference}
            color="var(--grn)"
            name="Session limit"
            meta="5h rolling window"
            countdown={usage.fiveHour.resetsAt}
          />
        )}
        {usage.sevenDay.utilization != null && (
          <RingDial
            pct={usage.sevenDay.utilization}
            circumference={circumference}
            color={usage.sevenDay.utilization >= 80 ? "var(--red)" : "var(--amb)"}
            name="Weekly limit"
            meta="7d rolling window"
            countdown={usage.sevenDay.resetsAt}
          />
        )}
      </div>
    </div>
  );
}

function RingDial({
  pct,
  circumference,
  color,
  name,
  meta,
  countdown,
}: {
  pct: number;
  circumference: number;
  color: string;
  name: string;
  meta: string;
  countdown: string | null;
}) {
  const offset = circumference * (1 - Math.min(pct, 100) / 100);
  const resetLabel = formatCountdown(countdown);

  return (
    <div
      style={{
        display: "flex", gap: 14, alignItems: "center",
        padding: "10px 12px",
        background: "var(--bg-e)", border: "1px solid var(--bd)",
        borderRadius: "var(--r)",
      }}
    >
      {/* Ring */}
      <div style={{ width: 72, height: 72, flexShrink: 0, position: "relative" }}>
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          style={{ display: "block", transform: "rotate(-90deg)" }}
        >
          <circle cx="36" cy="36" r="30" fill="none" stroke="var(--bg-s)" strokeWidth="7" />
          <circle
            cx="36" cy="36" r="30" fill="none"
            stroke={color} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference.toFixed(2)}
            strokeDashoffset={offset.toFixed(2)}
          />
        </svg>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700,
              color: "var(--t1)", lineHeight: 1,
              fontFeatureSettings: '"tnum"',
            }}
          >
            {pct}%
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 600,
              letterSpacing: ".6px", textTransform: "uppercase" as const,
              color: "var(--t3)", marginTop: 2,
            }}
          >
            used
          </div>
        </div>
      </div>

      {/* Side text */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>{name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)" }}>{meta}</div>
        {resetLabel && (
          <div
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t2)",
              marginTop: 3, display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ color: "var(--t3)", fontSize: 11 }}>↻</span>
            {resetLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCountdown(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMins = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `resets in ${days}d ${hours}h`;
  if (hours > 0) return `resets in ${hours}h ${mins}m`;
  return `resets in ${mins}m`;
}
