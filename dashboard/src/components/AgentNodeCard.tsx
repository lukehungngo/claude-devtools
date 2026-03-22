import { Handle, Position, type NodeProps } from "@xyflow/react";
import { formatCost, formatTokens } from "../lib/cost";
import type { AgentNode } from "../lib/types";

const statusColors: Record<string, string> = {
  active: "border-green-500",
  completed: "border-blue-500",
  error: "border-red-500",
};

const statusDotColors: Record<string, string> = {
  active: "bg-green-500",
  completed: "bg-blue-500",
  error: "bg-red-500",
};

const typeColors: Record<string, string> = {
  main: "text-blue-400",
  Explore: "text-cyan-400",
  Plan: "text-yellow-400",
  "general-purpose": "text-purple-400",
  unknown: "text-gray-400",
};

export function AgentNodeCard({ data }: NodeProps) {
  const node = data.agent as AgentNode;

  return (
    <div
      className={`bg-white dark:bg-gray-900 border-2 ${statusColors[node.status] || "border-gray-600"} rounded-lg p-3 min-w-[220px] shadow-lg`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />

      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full ${statusDotColors[node.status]}`}
        />
        <span
          className={`font-bold text-sm ${typeColors[node.type] || typeColors.unknown}`}
        >
          {node.type}
        </span>
        <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
          {node.status}
        </span>
      </div>

      {node.description && (
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px] mb-2">
          {node.description}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <div className="text-gray-500 dark:text-gray-400">
          In:{" "}
          <span className="text-gray-800 dark:text-gray-200 font-mono">
            {formatTokens(node.tokenUsage.inputTokens)}
          </span>
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          Out:{" "}
          <span className="text-gray-800 dark:text-gray-200 font-mono">
            {formatTokens(node.tokenUsage.outputTokens)}
          </span>
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          Cost:{" "}
          <span className="text-gray-800 dark:text-gray-200 font-mono">
            {formatCost(node.tokenUsage.totalCost)}
          </span>
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          Tools:{" "}
          <span className="text-gray-800 dark:text-gray-200 font-mono">
            {node.toolCalls}
          </span>
        </div>
        {node.mcpToolCalls > 0 && (
          <div className="text-gray-500 dark:text-gray-400 col-span-2">
            MCP:{" "}
            <span className="text-cyan-600 dark:text-cyan-400 font-mono">
              {node.mcpToolCalls}
            </span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-500"
      />
    </div>
  );
}
