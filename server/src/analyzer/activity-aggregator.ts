import type {
  SessionInfo,
  InsightsActivity,
  InsightsDailyBucket,
  InsightsHeatmapCell,
  InsightsHourlyBucket,
  InsightsTimeRange,
} from "../types.js";
import { computeInsightsSessionData, getTimeRangeCutoff } from "./insights-aggregator.js";

export function computeInsightsActivity(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsActivity {
  const fromMs = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const hourlyTokens = new Array<number>(24).fill(0);
  const hourlyCounts = new Array<number>(24).fill(0);
  const dailyMap = new Map<string, InsightsDailyBucket>();

  for (const session of filtered) {
    const data = computeInsightsSessionData(session);
    const volume = data.tokensIn + data.tokensOut;
    const dt = new Date(session.startTime);
    const day = (dt.getUTCDay() + 6) % 7;
    const hour = dt.getUTCHours();
    grid[day][hour] += volume;
    hourlyTokens[hour] += volume;
    hourlyCounts[hour]++;

    const dateKey = dt.toISOString().slice(0, 10);
    const bucket = dailyMap.get(dateKey) ?? { date: dateKey, tokensIn: 0, tokensOut: 0, cost: 0 };
    bucket.tokensIn += data.tokensIn;
    bucket.tokensOut += data.tokensOut;
    bucket.cost += data.cost;
    dailyMap.set(dateKey, bucket);
  }

  let maxVolume = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > maxVolume) maxVolume = grid[d][h];
    }
  }

  const heatmap: InsightsHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h];
      const intensity =
        maxVolume === 0 || v === 0
          ? 0
          : (Math.min(4, Math.ceil((v / maxVolume) * 4)) as 0 | 1 | 2 | 3 | 4);
      heatmap.push({ day: d, hour: h, intensity });
    }
  }

  const hourly: InsightsHourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tokensAvg: hourlyCounts[h] > 0 ? hourlyTokens[h] / hourlyCounts[h] : 0,
  }));

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return { heatmap, hourly, daily };
}
