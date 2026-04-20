import { useState, useEffect } from "react";
import type { InsightsActivity } from "../lib/types.js";

export interface UseInsightsActivityResult {
  data: InsightsActivity | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsActivity(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsActivityResult {
  const [data, setData] = useState<InsightsActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const tz = new Date().getTimezoneOffset();
    const url = `/api/insights/activity?timeRange=${encodeURIComponent(timeRange)}&repo=${encodeURIComponent(repo)}&tz=${tz}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<InsightsActivity>;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load activity");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo, refreshCount]);

  return { data, loading, error };
}
