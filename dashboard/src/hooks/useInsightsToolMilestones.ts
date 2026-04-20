import { useState, useEffect } from "react";
import type { InsightsToolMilestone } from "../lib/types.js";

export interface UseInsightsToolMilestonesResult {
  data: InsightsToolMilestone[] | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsToolMilestones(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsToolMilestonesResult {
  const [data, setData] = useState<InsightsToolMilestone[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // timeRange is passed for parity with other hooks but milestones endpoint
    // uses repo filtering only — the timeRange query param is accepted but ignored.
    fetch(`/api/insights/tool-milestones?timeRange=${timeRange}&repo=${encodeURIComponent(repo)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<InsightsToolMilestone[]>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load tool milestones"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo, refreshCount]);

  return { data, loading, error };
}
