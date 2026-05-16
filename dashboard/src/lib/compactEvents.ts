/**
 * compact_boundary marker extraction for replayed (historical) sessions.
 *
 * The live SSE path already surfaces compaction via StreamingTurnArea's
 * 3-second `compactResult` banner. Replayed sessions read events from JSONL
 * via REST and never had a corresponding inline indicator — this module
 * computes the row data the conversation view uses to inject a small inline
 * marker between turns when a compact_boundary event sits in that gap.
 *
 * Field naming: real CC v2.1.143 JSONLs use camelCase `compactMetadata` with
 * camelCase `preCompactDiscoveredTools` (per server/src/http/sse-event-handler.ts
 * P0-4 + P1-5 mapping); we also fall back to snake_case for older shapes
 * the way the SSE handler does.
 */

import type { SessionEvent, SystemEvent } from "./types";
import type { TurnSnapshot } from "./turnSnapshot";
import { asNumber, asString, asStringArray } from "./narrowing";

/** Single inline marker row to render between turns. */
export interface CompactMarker {
  /** Stable React key — the compact_boundary event UUID. */
  uuid: string;
  /** Event timestamp (ISO). */
  timestamp: string;
  /**
   * Turn number AFTER which the marker is rendered (i.e. the marker sits in
   * the gap between turn N and turn N+1, so this is N). 1-indexed to match
   * TurnSnapshot.turnNumber. Always >= 1 — compact_boundary events that fall
   * before the first turn are skipped (no preceding context to caption).
   */
  turnNumber: number;
  trigger: string;
  preTokens: number;
  postTokens?: number;
  durationMs?: number;
  preCompactDiscoveredTools?: string[];
}

/**
 * Narrow shape used only inside this module. The global SystemEvent type
 * does not yet declare `compactMetadata`; we keep the widening local rather
 * than modifying shared types out-of-scope.
 */
interface CompactBoundaryEvent extends SystemEvent {
  subtype: "compact_boundary";
  compactMetadata?: Record<string, unknown>;
}

function isCompactBoundary(event: SessionEvent): event is CompactBoundaryEvent {
  return event.type === "system" && (event as SystemEvent).subtype === "compact_boundary";
}


/**
 * Walk events once; for each compact_boundary, attribute it to the turn it
 * sits inside (or follows) and emit a CompactMarker row. The marker is
 * rendered visually BETWEEN that turn and the next — i.e. as the tail of the
 * turn whose event slice [startIndex, endIndex) contains the boundary event.
 *
 * Because `groupEventsIntoTurns` walks events sequentially and only opens a
 * new turn on a fresh user prompt, a compact_boundary that arrives after
 * turn N's assistant response and before the user's next prompt is bucketed
 * into turn N. The "between turns" semantics in the UI therefore map to
 * "tail of turn N" in the data.
 *
 * Boundaries that arrive before any user turn began (no preceding turn to
 * caption) are skipped.
 *
 * Performance: O(events + turns). Caller should useMemo() over (events, turns).
 */
export function extractCompactMarkers(
  events: SessionEvent[],
  turns: TurnSnapshot[],
): CompactMarker[] {
  if (turns.length === 0 || events.length === 0) return [];

  const markers: CompactMarker[] = [];
  // Cursor into `turns` that we advance monotonically; valid because event
  // indices are scanned in order.
  let turnIdx = 0;

  for (let i = 0; i < events.length; i++) {
    if (!isCompactBoundary(events[i])) continue;

    // Skip boundaries that arrive before any turn started.
    if (i < turns[0].startIndex) continue;

    // Advance turnIdx so turns[turnIdx] is the turn whose [startIndex, endIndex)
    // either contains i, or which is the LAST turn whose startIndex <= i.
    while (
      turnIdx + 1 < turns.length &&
      turns[turnIdx + 1].startIndex <= i
    ) {
      turnIdx++;
    }

    const owningTurn = turns[turnIdx];
    if (i <= owningTurn.startIndex) continue;
    // Require a real user prompt at the turn's opening — guards against the
    // case where leading non-user events (e.g. a stray compact_boundary at
    // session start) get grouped into turn 1's slice without a prior prompt.
    const opening = events[owningTurn.startIndex];
    if (!opening || opening.type !== "user") continue;

    const evt = events[i] as CompactBoundaryEvent;
    const meta = evt.compactMetadata;
    if (!meta || typeof meta !== "object") continue;

    const trigger = asString(meta.trigger);
    const preTokens = asNumber(meta.preTokens);
    if (trigger == null || preTokens == null) continue;

    markers.push({
      uuid: evt.uuid,
      timestamp: evt.timestamp,
      turnNumber: owningTurn.turnNumber,
      trigger,
      preTokens,
      postTokens: asNumber(meta.postTokens),
      durationMs: asNumber(meta.durationMs),
      preCompactDiscoveredTools:
        asStringArray(meta.preCompactDiscoveredTools) ??
        asStringArray(meta.pre_compact_discovered_tools),
    });
  }

  return markers;
}
