import { useState, useEffect } from "react";

export interface InsightsModelEntry {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
  share: number;
}

export interface InsightsBreakdown {
  models: InsightsModelEntry[];
  topRepos: Array<{ slug: string; tokens: number; cost: number }>;
  topSessions: Array<{ id: string; label: string; cost: number }>;
  topTools: Array<{ name: string; calls: number }>;
}

type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";

interface UseInsightsBreakdownResult {
  data: InsightsBreakdown | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsBreakdown(timeRange: TimeRange, repo: string): UseInsightsBreakdownResult {
  const [data, setData] = useState<InsightsBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/insights/breakdown?timeRange=${encodeURIComponent(timeRange)}&repo=${encodeURIComponent(repo)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<InsightsBreakdown>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load breakdown");
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo]);

  return { data, loading, error };
}
