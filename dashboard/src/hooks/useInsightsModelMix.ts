import { useState, useEffect } from "react";

export interface ModelRowClient {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
  share: number;
}

export interface ModelMixClient {
  models: ModelRowClient[];
  totalTokens: number;
}

export interface UseInsightsModelMixResult {
  data: ModelMixClient | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsModelMix(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsModelMixResult {
  const [data, setData] = useState<ModelMixClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const tz = new Date().getTimezoneOffset();
    fetch(`/api/insights/model-mix?timeRange=${timeRange}&repo=${repo}&tz=${tz}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ModelMixClient>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load model mix");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo, refreshCount]);

  return { data, loading, error };
}
