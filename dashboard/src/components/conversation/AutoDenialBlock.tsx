import { ShieldX } from "lucide-react";
import type { PermissionDeniedRecord } from "../../lib/streaming-types";

interface AutoDenialBlockProps {
  record: PermissionDeniedRecord;
}

/**
 * NEW-9: SDK auto-denial row, distinct from PermissionBlock (which renders
 * the interactive ask path). Surfaces an `SDKPermissionDeniedMessage`
 * — emitted when an `auto-mode` classifier, deny rule, permission mode, or
 * async subagent short-circuits a tool call without the user being prompted.
 *
 * Color scheme on the badge encodes `decision_reason_type`:
 *  - classifier   -> --cat-cyan
 *  - rule         -> --cat-amber
 *  - mode         -> --cat-purple
 *  - asyncAgent   -> --cat-orange
 *  - default      -> --err   (red — unknown / future value)
 *
 * See sdk.d.ts:3244-3268 (SDKPermissionDeniedMessage).
 */
export function AutoDenialBlock({ record }: AutoDenialBlockProps): JSX.Element {
  const badgeColor = badgeColorFor(record.decision_reason_type);
  const badgeLabel = record.decision_reason_type ?? "denied";

  return (
    <div
      data-testid="auto-denial-block"
      className="flex flex-col gap-1 my-2 mx-0 rounded text-xs"
      style={{
        border: "1px solid var(--err)",
        background: "color-mix(in srgb, var(--err) 8%, transparent)",
        padding: "8px 10px",
      }}
    >
      <div className="flex items-center gap-2">
        <ShieldX size={14} aria-hidden="true" style={{ color: "var(--err)" }} />
        <span className="font-mono font-semibold text-dt-text0">{record.tool_name}</span>
        <span
          data-testid="auto-denial-badge"
          className="font-mono uppercase tracking-wider rounded"
          style={{
            color: badgeColor,
            border: `1px solid ${badgeColor}`,
            padding: "1px 6px",
            fontSize: 12,
          }}
        >
          {badgeLabel}
        </span>
        {record.agent_id && (
          <span className="text-dt-text2 font-mono" style={{ fontSize: 12 }}>
            agent {record.agent_id}
          </span>
        )}
        {record.decision_reason && (
          <span
            data-testid="auto-denial-reason"
            className="text-dt-text2 truncate"
            title={record.decision_reason}
          >
            {record.decision_reason}
          </span>
        )}
      </div>
      <div className="text-dt-text1" style={{ paddingLeft: 22 }}>
        {record.message}
      </div>
    </div>
  );
}

function badgeColorFor(decisionReasonType: string | undefined): string {
  switch (decisionReasonType) {
    case "classifier":
      return "var(--cat-cyan)";
    case "rule":
      return "var(--cat-amber)";
    case "mode":
      return "var(--cat-purple)";
    case "asyncAgent":
      return "var(--cat-orange)";
    default:
      return "var(--err)";
  }
}
