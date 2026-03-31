import { memo } from "react";

export interface FindingBannerProps {
  severity: "flag" | "warning" | "error";
  text: string;
}

const SEVERITY_CONFIG = {
  flag: { label: "FLAG", color: "var(--amb)", bg: "var(--amb-bg)" },
  warning: { label: "WARNING", color: "var(--amb)", bg: "var(--amb-bg)" },
  error: { label: "ERROR", color: "var(--red)", bg: "var(--red-bg)" },
} as const;

export const FindingBanner = memo(function FindingBanner({
  severity,
  text,
}: FindingBannerProps): JSX.Element {
  const config = SEVERITY_CONFIG[severity];
  const role = severity === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className="flex items-start gap-2 rounded-dt-xs"
      style={{
        padding: "6px 10px",
        margin: "2px 0",
        borderLeft: `3px solid ${config.color}`,
        backgroundColor: config.bg,
      }}
    >
      <span
        className="shrink-0 font-semibold uppercase"
        style={{
          fontSize: "11px",
          letterSpacing: "0.3px",
          color: config.color,
        }}
      >
        {config.label}
      </span>
      <span
        className="flex-1"
        style={{
          fontSize: "12px",
          color: "var(--t1)",
        }}
      >
        {text}
      </span>
    </div>
  );
});
