import { useCallback, useEffect, useRef, useState } from "react";
import { nextPanelWidth } from "../lib/resizePanel";

export interface UseResizablePanelResult {
  /** Current panel width in px. */
  width: number;
  /** True while the user is actively dragging the handle. */
  dragging: boolean;
  /** Bind to the resize handle's onPointerDown. */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Reset to the default width (e.g. on double-click). */
  reset: () => void;
}

const MIN = 320;
const MAX_FRACTION = 0.7;

function readStored(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Manage a horizontally-resizable RIGHT panel: drag the left-edge handle to
 * resize, clamped to [MIN, 70% viewport], persisted to localStorage. Listeners
 * attach to window only while dragging, and detach on pointer-up/unmount.
 */
export function useResizablePanel(
  storageKey: string,
  defaultWidth: number,
): UseResizablePanelResult {
  const [width, setWidth] = useState(() => readStored(storageKey, defaultWidth));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, startW: width };
      setDragging(true);
      e.preventDefault();
    },
    [width],
  );

  const reset = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
      setWidth(nextPanelWidth(d.startW, e.clientX - d.startX, vw, { min: MIN, maxFraction: MAX_FRACTION }));
    };
    const onUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [storageKey, width]);

  return { width, dragging, onPointerDown, reset };
}
