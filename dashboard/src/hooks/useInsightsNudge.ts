import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";

const STORAGE_KEY = "cdt:insights-last-click";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface InsightsNudgeState {
  nudgeActive: boolean;
}

function readLastClickMs(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function safeWriteInsightsLastClick(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable — silent no-op
  }
}

export function useInsightsNudge(): InsightsNudgeState {
  const { pathname } = useLocation();
  const isOnInsightsPage = pathname === "/insights";

  const lastClickMs = useMemo(
    () => (isOnInsightsPage ? null : readLastClickMs()),
    [isOnInsightsPage, pathname],
  );

  const nudgeActive =
    !isOnInsightsPage &&
    (lastClickMs === null || Date.now() - lastClickMs >= THREE_DAYS_MS);

  return { nudgeActive };
}
