import { Minimize2 } from "lucide-react";
import type { CompactMarker } from "../../lib/compactEvents";

interface StaticCompactMarkerProps {
  marker: CompactMarker;
}

/**
 * Inline marker rendered in the conversation view to surface compact_boundary
 * events from REPLAYED (historical) sessions. Live SSE sessions get a 3s
 * toast via StreamingTurnArea's CompactResultBanner — this is the static
 * equivalent that persists in the scrollback so the user can see WHERE a
 * compaction occurred when scrolling back through an old session.
 *
 * Visual contract: one short line, ~28px tall, accent var(--purple),
 * hairline rules either side to visually separate the surrounding turns.
 */
export function StaticCompactMarker({ marker }: StaticCompactMarkerProps): JSX.Element {
  const triggerLabel = formatTriggerLabel(marker.trigger);
  const tokensLabel = formatTokens(marker.preTokens, marker.postTokens);
  const durationLabel = formatDuration(marker.durationMs);

  const detailParts: string[] = [tokensLabel];
  if (durationLabel) detailParts.push(durationLabel);
  const details = detailParts.join(", ");

  const toolsCount = marker.preCompactDiscoveredTools?.length ?? 0;
  const title = toolsCount > 0
    ? `${toolsCount} tools discovered before compaction`
    : undefined;

  return (
    <div
      data-testid="static-compact-marker"
      title={title}
      className="flex items-center gap-2 text-xs italic select-none"
      style={{
        color: "var(--purple)",
        padding: "6px 0",
        minHeight: 28,
      }}
    >
      <span
        aria-hidden="true"
        className="flex-1"
        style={{
          height: 1,
          background: "var(--bd)",
          opacity: 0.6,
        }}
      />
      <Minimize2 size={12} aria-hidden="true" />
      <span>
        {triggerLabel} at turn {marker.turnNumber} — {details}
      </span>
      <span
        aria-hidden="true"
        className="flex-1"
        style={{
          height: 1,
          background: "var(--bd)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}

function formatTriggerLabel(trigger: string): string {
  if (trigger === "auto") return "auto-compacted";
  if (trigger === "manual") return "compacted via /compact";
  return `compacted (${trigger})`;
}

function formatTokens(preTokens: number, postTokens: number | undefined): string {
  if (postTokens != null && postTokens > 0 && preTokens > 0) {
    return `${preTokens.toLocaleString()} → ${postTokens.toLocaleString()} tokens`;
  }
  return `${preTokens.toLocaleString()} tokens`;
}

function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs == null || durationMs < 0) return null;
  const sec = durationMs / 1000;
  return `${sec.toFixed(1)}s`;
}
