import { memo } from "react";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface VerdictBannerProps {
  verdict: "proceed" | "fail" | "flag" | "approved" | "blocked";
  summary: string;
  detail?: string;
}

interface VerdictConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
}

const VERDICT_MAP: Record<VerdictBannerProps["verdict"], VerdictConfig> = {
  proceed: { icon: CheckCircle, color: "var(--grn)", bg: "var(--grn-bg)" },
  approved: { icon: CheckCircle, color: "var(--grn)", bg: "var(--grn-bg)" },
  fail: { icon: XCircle, color: "var(--red)", bg: "var(--red-bg)" },
  blocked: { icon: XCircle, color: "var(--red)", bg: "var(--red-bg)" },
  flag: { icon: AlertTriangle, color: "var(--amb)", bg: "var(--amb-bg)" },
};

export const VerdictBanner = memo(function VerdictBanner({
  verdict,
  summary,
  detail,
}: VerdictBannerProps): JSX.Element {
  const config = VERDICT_MAP[verdict];
  const Icon = config.icon;

  return (
    <div
      data-testid="verdict-banner"
      role="status"
      aria-label={`${verdict}: ${summary}`}
      className="flex items-center gap-2 rounded-dt-sm mb-3"
      style={{
        padding: "8px 12px",
        borderLeft: `3px solid ${config.color}`,
        backgroundColor: config.bg,
      }}
    >
      <Icon size={13} style={{ color: config.color, flexShrink: 0 }} />
      <span
        className="text-xs font-semibold uppercase"
        style={{ color: config.color, fontSize: 13 }}
      >
        {verdict.toUpperCase()}
      </span>
      <span className="text-xs" style={{ color: "var(--t1)", fontSize: 13 }}>
        {summary}
      </span>
      {detail != null && (
        <span
          data-testid="verdict-detail"
          className="text-xs ml-auto"
          style={{ color: "var(--t3)", fontSize: 12 }}
        >
          {detail}
        </span>
      )}
    </div>
  );
});
