import { useState, useEffect } from "react";

export interface TopRepoClient {
  repo: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cost: number;
  share: number;
}

export interface TopSessionClient {
  sessionId: string;
  date: string;
  repo: string;
  cost: number;
  share: number;
}

export interface TopToolClient {
  name: string;
  count: number;
  share: number;
}

export interface TopConsumersClient {
  repos: TopRepoClient[];
  sessions: TopSessionClient[];
  tools: TopToolClient[];
}

export interface UseInsightsTopConsumersResult {
  data: TopConsumersClient | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsTopConsumers(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsTopConsumersResult {
  const [data, setData] = useState<TopConsumersClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/insights/top-consumers?timeRange=${timeRange}&repo=${repo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TopConsumersClient>;
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
            err instanceof Error ? err.message : "Failed to load top consumers"
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
