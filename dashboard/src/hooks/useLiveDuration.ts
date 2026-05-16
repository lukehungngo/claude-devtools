import { useEffect, useState } from "react";

/**
 * Compute a duration string ("3m 34s") that ticks every 1s while live.
 * Freezes when `endedAt` is provided or when `isLive` is false.
 *
 * Phase 4 — Background Agents + Agent Graph visual rebuild.
 */
export function useLiveDuration(
  spawnedAt: string | null | undefined,
  endedAt: string | null | undefined,
  isLive: boolean,
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive || endedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isLive, endedAt]);

  if (!spawnedAt) return "—";
  const start = new Date(spawnedAt).getTime();
  if (Number.isNaN(start)) return "—";
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const ms = Math.max(0, end - start);

  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
