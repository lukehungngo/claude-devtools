import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { SessionMetrics } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#eab308"];

export function TokenChart({ metrics }: { metrics: SessionMetrics }) {
  const turnData = metrics.tokensByTurn.map((t) => ({
    turn: t.index,
    input: t.inputTokens,
    output: t.outputTokens,
    cacheRead: t.cacheReadTokens,
    cumulativeCost: t.cumulativeCost,
  }));

  const modelData = Object.entries(metrics.tokensByModel).map(
    ([model, tokens]) => ({
      name: model.replace("claude-", "").split("-").slice(0, 2).join("-"),
      value: tokens.totalCost,
    })
  );

  return (
    <div className="space-y-6">
      {/* Cumulative cost over turns */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Cumulative Cost Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={turnData}>
            <XAxis dataKey="turn" stroke="#6b7280" />
            <YAxis
              stroke="#6b7280"
              tickFormatter={(v: number) => formatCost(v)}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
              formatter={(v: number) => formatCost(v)}
            />
            <Area
              type="monotone"
              dataKey="cumulativeCost"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Token usage per turn */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Tokens Per Turn
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={turnData}>
            <XAxis dataKey="turn" stroke="#6b7280" />
            <YAxis
              stroke="#6b7280"
              tickFormatter={(v: number) => formatTokens(v)}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
              formatter={(v: number) => formatTokens(v)}
            />
            <Area
              type="monotone"
              dataKey="input"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
              name="Input"
            />
            <Area
              type="monotone"
              dataKey="output"
              stackId="1"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.3}
              name="Output"
            />
            <Area
              type="monotone"
              dataKey="cacheRead"
              stackId="1"
              stroke="#06b6d4"
              fill="#06b6d4"
              fillOpacity={0.3}
              name="Cache Read"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cost by model */}
      {modelData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Cost by Model
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={modelData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, value }: { name: string; value: number }) =>
                  `${name}: ${formatCost(value)}`
                }
              >
                {modelData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
