/**
 * NEW-9: permission_denied marker extraction for replayed (historical)
 * sessions, mirroring `compactEvents.ts`.
 *
 * The live SSE path surfaces auto-denials via `useStreamingState`'s
 * `permissionDenials` state. Replayed sessions read events from JSONL via
 * REST and need an inline indicator at the position where the SDK emitted
 * `system.permission_denied` — this module produces the records the
 * ConversationView consumes to render `AutoDenialBlock` between turns.
 *
 * See sdk.d.ts:3244-3268 (SDKPermissionDeniedMessage).
 */

import type { SessionEvent, SystemEvent } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";
import type { PermissionDeniedRecord } from "./streaming-types";

/** Replayed auto-denial row, anchored to a turn for layout. */
export interface PermissionDenialMarker extends PermissionDeniedRecord {
  /** Stable React key — the permission_denied event UUID. */
  uuid: string;
  /** Event timestamp (ISO). */
  timestamp: string;
  /**
   * Turn number whose [startIndex, endIndex) contains the boundary event.
   * 1-indexed to match TurnSnapshot.turnNumber. Markers before any turn are
   * skipped.
   */
  turnNumber: number;
}

/**
 * Local widening — SystemEvent.subtype is `string`; the SDK adds extra
 * fields for permission_denied that aren't on the shared SystemEvent type.
 * Same pattern as `CompactBoundaryEvent` in compactEvents.ts.
 */
interface PermissionDeniedSystemEvent extends SystemEvent {
  subtype: "permission_denied";
  tool_name?: unknown;
  tool_use_id?: unknown;
  agent_id?: unknown;
  decision_reason_type?: unknown;
  decision_reason?: unknown;
  message?: unknown;
}

function isPermissionDenied(event: SessionEvent): event is PermissionDeniedSystemEvent {
  return (
    event.type === "system" && (event as SystemEvent).subtype === "permission_denied"
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Walk events once; for each permission_denied, anchor it to the turn it
 * sits inside (or follows) and emit a marker. The marker is rendered
 * visually BETWEEN that turn and the next — tail of turn N in the data.
 *
 * Boundaries before any user turn are skipped (no preceding context).
 *
 * Performance: O(events + turns). Caller should useMemo() over (events, turns).
 */
export function extractPermissionDenials(
  events: SessionEvent[],
  turns: TurnSnapshot[],
): PermissionDenialMarker[] {
  if (turns.length === 0 || events.length === 0) return [];

  const markers: PermissionDenialMarker[] = [];
  let turnIdx = 0;
  const seenToolUseIds = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    if (!isPermissionDenied(events[i])) continue;
    if (i < turns[0].startIndex) continue;

    while (turnIdx + 1 < turns.length && turns[turnIdx + 1].startIndex <= i) {
      turnIdx++;
    }

    const owningTurn = turns[turnIdx];
    if (i <= owningTurn.startIndex) continue;

    const opening = events[owningTurn.startIndex];
    if (!opening || opening.type !== "user") continue;

    const evt = events[i] as PermissionDeniedSystemEvent;
    const toolName = asString(evt.tool_name);
    const toolUseId = asString(evt.tool_use_id);
    const message = asString(evt.message);
    if (!toolName || !toolUseId || !message) continue;

    // Dedupe by tool_use_id — same one-shot signal as the live path. If the
    // JSONL contains a duplicate, the first occurrence wins.
    if (seenToolUseIds.has(toolUseId)) continue;
    seenToolUseIds.add(toolUseId);

    markers.push({
      uuid: evt.uuid,
      timestamp: evt.timestamp,
      turnNumber: owningTurn.turnNumber,
      tool_name: toolName,
      tool_use_id: toolUseId,
      agent_id: asString(evt.agent_id),
      decision_reason_type: asString(evt.decision_reason_type),
      decision_reason: asString(evt.decision_reason),
      message,
    });
  }

  return markers;
}
