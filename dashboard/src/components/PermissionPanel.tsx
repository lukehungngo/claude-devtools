import { Check, X, Shield } from "lucide-react";
import type { PermissionRequest } from "../lib/types";

interface Props {
  permissions: PermissionRequest[];
  onDecide: (id: string, decision: "approved" | "denied") => void;
}

export function PermissionPanel({ permissions, onDecide }: Props) {
  const pending = permissions.filter((p) => p.status === "pending");
  const resolved = permissions.filter((p) => p.status !== "pending").slice(-5);

  return (
    <div className="flex flex-col h-full p-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Shield size={14} className="text-yellow-500" />
        <span className="text-xs font-semibold">
          Permissions
          {pending.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-white rounded-full text-[10px]">
              {pending.length}
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {pending.length === 0 && resolved.length === 0 && (
          <p className="text-gray-500 text-xs">No permission requests</p>
        )}

        {pending.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono font-medium truncate">
                {p.toolName}
              </div>
              <div className="text-gray-500 truncate text-[10px]">
                {JSON.stringify(p.input).slice(0, 60)}
              </div>
            </div>
            <button
              onClick={() => onDecide(p.id, "approved")}
              className="p-1 bg-green-500 hover:bg-green-600 text-white rounded transition"
              title="Approve"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => onDecide(p.id, "denied")}
              className="p-1 bg-red-500 hover:bg-red-600 text-white rounded transition"
              title="Deny"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {resolved.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 p-1.5 rounded text-xs text-gray-400 opacity-60"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                p.status === "approved" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="font-mono truncate">{p.toolName}</span>
            <span className="ml-auto">{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
