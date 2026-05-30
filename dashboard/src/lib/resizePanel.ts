export interface PanelWidthOptions {
  /** Minimum width in px. */
  min: number;
  /** Maximum width as a fraction of the viewport width (0–1). */
  maxFraction: number;
}

/**
 * Compute a right-panel width from a drag delta, clamped to [min, viewport*maxFraction].
 *
 * The resize handle sits on the panel's LEFT edge, so dragging LEFT (negative
 * deltaX) widens the panel and dragging RIGHT narrows it. Uses the drag delta
 * (not absolute cursor position), so it is independent of page layout/offsets.
 * Pure and deterministic.
 */
export function nextPanelWidth(
  startWidth: number,
  deltaX: number,
  viewportWidth: number,
  opts: PanelWidthOptions,
): number {
  const max = Math.round(viewportWidth * opts.maxFraction);
  const raw = startWidth - deltaX;
  return Math.max(opts.min, Math.min(max, raw));
}
