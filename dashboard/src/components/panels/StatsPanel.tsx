import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface StatsData {
  totalSessions: number;
  totalEvents: number;
  sessionsPerDay: { date: string; count: number }[];
  topRepos: { name: string; sessions: number }[];
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-dt bg-dt-bg3">
      <span className="text-2xl font-bold text-dt-text0">{value}</span>
      <span className="text-sm text-dt-text2">{label}</span>
    </div>
  );
}

export function StatsPanel(): JSX.Element {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats(): Promise<void> {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <h2 className="text-lg font-bold text-dt-text0">Statistics</h2>
        <div className="text-sm text-dt-text2">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <h2 className="text-lg font-bold text-dt-text0">Statistics</h2>
        <div className="px-3 py-2 rounded-dt bg-dt-red-dim text-dt-red text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!stats) return <div />;

  const avgEvents = stats.totalSessions > 0
    ? Math.round(stats.totalEvents / stats.totalSessions)
    : 0;

  const chartData = stats.sessionsPerDay.map((d) => ({
    date: formatDateLabel(d.date),
    count: d.count,
  }));

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <h2 className="text-lg font-bold text-dt-text0">Statistics</h2>

      {/* Summary cards -- 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Sessions" value={formatNumber(stats.totalSessions)} />
        <StatCard label="Total Events" value={formatNumber(stats.totalEvents)} />
        <StatCard label="Avg Events/Session" value={formatNumber(avgEvents)} />
        <StatCard label="Active Repos" value={formatNumber(stats.topRepos.length)} />
      </div>

      {/* Sessions per day chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-dt-text1 mb-2">Sessions per Day</h3>
          <div aria-label="Sessions per day bar chart" className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-2)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-2)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text-0)",
                  }}
                />
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top repos */}
      {stats.topRepos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-dt-text1 mb-2">Top Repositories</h3>
          <ol className="flex flex-col gap-1.5">
            {stats.topRepos.map((repo, i) => (
              <li
                key={repo.name}
                className="flex items-center gap-3 px-3 py-2 rounded-dt bg-dt-bg2 border border-dt-border"
              >
                <span className="text-xs text-dt-text2 font-mono w-5 text-right">{i + 1}.</span>
                <span className="text-sm text-dt-text1 font-medium flex-1 truncate">{repo.name}</span>
                <span className="text-xs text-dt-text2">{repo.sessions}s</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
