import { useState, useEffect } from "react";

export interface InsightsAggregateClient {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  sessions: number;
  turns: number;
  avgCostPerTurn: number;
  avgTokensPerTurn: number;
  activeDays: number;
  peakHour: number;
  daily: Array<{ date: string; tokensIn: number; tokensOut: number; cost: number }>;
}

export interface DeltaData {
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
}

export interface UseInsightsResult {
  data: InsightsAggregateClient | null;
  delta: DeltaData | null;
  loading: boolean;
  error: string | null;
}

const DELTA_RANGE: Record<string, string | null> = {
  "24h": null,
  "7d": "30d",
  "30d": "90d",
  "90d": "all",
  "all": null,
};

const RANGE_DAYS: Record<string, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "all": null,
};

function daysAgoUtcString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function sumDailySlice(
  daily: InsightsAggregateClient["daily"],
  fromDaysAgo: number,
  toDaysAgo: number
): { tokensIn: number; tokensOut: number; cost: number } {
  // Compare by date string (YYYY-MM-DD) to avoid sub-day timestamp drift.
  // Range is [fromDaysAgo, toDaysAgo) — inclusive lower bound, exclusive upper bound.
  // For toDaysAgo=0 we include today and beyond (open upper bound).
  const fromDate = daysAgoUtcString(fromDaysAgo);
  const toDate = toDaysAgo === 0 ? null : daysAgoUtcString(toDaysAgo);

  return daily
    .filter((d) => d.date >= fromDate && (toDate === null || d.date < toDate))
    .reduce(
      (acc, d) => ({
        tokensIn: acc.tokensIn + d.tokensIn,
        tokensOut: acc.tokensOut + d.tokensOut,
        cost: acc.cost + d.cost,
      }),
      { tokensIn: 0, tokensOut: 0, cost: 0 }
    );
}

function computeDelta(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return (current - prev) / prev;
}

export function useInsightsAggregate(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsResult {
  const [data, setData] = useState<InsightsAggregateClient | null>(null);
  const [delta, setDelta] = useState<DeltaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const primaryUrl = `/api/insights/aggregate?timeRange=${timeRange}&repo=${repo}`;
    const deltaRange = DELTA_RANGE[timeRange] ?? null;
    const deltaUrl = deltaRange
      ? `/api/insights/aggregate?timeRange=${deltaRange}&repo=${repo}`
      : null;

    const primaryFetch = fetch(primaryUrl).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<InsightsAggregateClient>;
    });

    const deltaFetch: Promise<InsightsAggregateClient | null> = deltaUrl
      ? fetch(deltaUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<InsightsAggregateClient>;
        })
      : Promise.resolve(null);

    Promise.all([primaryFetch, deltaFetch])
      .then(([primary, wider]) => {
        if (cancelled) return;
        setData(primary);
        const rangeDays = RANGE_DAYS[timeRange] ?? null;
        if (wider !== null && rangeDays !== null) {
          const currentSlice = sumDailySlice(wider.daily, rangeDays, 0);
          const prevSlice = sumDailySlice(wider.daily, rangeDays * 2, rangeDays);
          setDelta({
            tokensIn: computeDelta(currentSlice.tokensIn, prevSlice.tokensIn),
            tokensOut: computeDelta(currentSlice.tokensOut, prevSlice.tokensOut),
            cost: computeDelta(currentSlice.cost, prevSlice.cost),
          });
        } else {
          setDelta(null);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load insights");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo, refreshCount]);

  return { data, delta, loading, error };
}
