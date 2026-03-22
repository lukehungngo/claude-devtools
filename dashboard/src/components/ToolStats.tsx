import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ToolCallStat } from "../lib/types";

export function ToolStats({ tools }: { tools: ToolCallStat[] }) {
  const barData = tools.slice(0, 15).map((t) => ({
    name: t.isMcp ? `${t.mcpServer}/${t.name.split("__").pop()}` : t.name,
    count: t.count,
    errors: t.errors,
    isMcp: t.isMcp,
  }));

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Tool Usage (Top 15)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={barData} layout="vertical">
            <XAxis type="number" stroke="#6b7280" />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#6b7280"
              width={200}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
            />
            <Bar dataKey="count" name="Calls">
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isMcp ? "#06b6d4" : "#3b82f6"}
                />
              ))}
            </Bar>
            <Bar dataKey="errors" name="Errors" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          All Tools
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-3">Tool</th>
              <th className="text-right py-2 px-3">Calls</th>
              <th className="text-right py-2 px-3">Errors</th>
              <th className="text-right py-2 px-3">Error Rate</th>
              <th className="text-left py-2 px-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.name} className="border-b border-gray-800/50">
                <td className="py-2 px-3 font-mono text-xs">{t.name}</td>
                <td className="py-2 px-3 text-right">{t.count}</td>
                <td className="py-2 px-3 text-right text-red-400">
                  {t.errors || "-"}
                </td>
                <td className="py-2 px-3 text-right">
                  {t.count > 0
                    ? `${Math.round((t.errors / t.count) * 100)}%`
                    : "-"}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      t.isMcp
                        ? "bg-cyan-900/30 text-cyan-400"
                        : "bg-blue-900/30 text-blue-400"
                    }`}
                  >
                    {t.isMcp ? `MCP (${t.mcpServer})` : "Built-in"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
