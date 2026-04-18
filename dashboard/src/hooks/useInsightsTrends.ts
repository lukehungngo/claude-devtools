import { useState, useEffect } from "react";

export type TrendVerdict = "improving" | "stable" | "regressing";

export interface InsightsTrendEntry {
  name: string;
  calls: number;
  avgIn: number;
  avgOut: number;
  weekly: Array<{ in: number; out: number }>;
  verdict: TrendVerdict;
}

export interface InsightsTrends {
  commands: InsightsTrendEntry[];
  agents: InsightsTrendEntry[];
  skills: InsightsTrendEntry[];
}

type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";

interface UseInsightsTrendsResult {
  data: InsightsTrends | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsTrends(timeRange: TimeRange, repo: string): UseInsightsTrendsResult {
  const [data, setData] = useState<InsightsTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/insights/trends?timeRange=${encodeURIComponent(timeRange)}&repo=${encodeURIComponent(repo)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<InsightsTrends>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trends");
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
