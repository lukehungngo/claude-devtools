import { useMemo } from "react";
import { CheckCircle, XCircle, Clock, Shield } from "lucide-react";
import type { PermissionRequest } from "../../lib/types";

interface PermissionHistoryProps {
  permissions: PermissionRequest[];
}

interface ToolAggregate {
  toolName: string;
  approved: number;
  denied: number;
  pending: number;
}

const STATUS_CONFIG = {
  approved: { icon: CheckCircle, color: "var(--grn)", label: "approved" },
  denied: { icon: XCircle, color: "var(--red)", label: "denied" },
  pending: { icon: Clock, color: "var(--amb)", label: "pending" },
} as const;

function summarizeInput(input: Record<string, unknown>): string {
  if (typeof input.command === "string") {
    return input.command.length > 80
      ? input.command.slice(0, 77) + "..."
      : input.command;
  }
  if (typeof input.file_path === "string") {
    return input.file_path.length > 80
      ? input.file_path.slice(0, 77) + "..."
      : input.file_path;
  }
  const json = JSON.stringify(input);
  return json.length > 80 ? json.slice(0, 77) + "..." : json;
}

function aggregateByTool(permissions: readonly PermissionRequest[]): ToolAggregate[] {
  const map = new Map<string, ToolAggregate>();
  for (const p of permissions) {
    const existing = map.get(p.toolName);
    if (existing) {
      existing[p.status] += 1;
    } else {
      map.set(p.toolName, {
        toolName: p.toolName,
        approved: p.status === "approved" ? 1 : 0,
        denied: p.status === "denied" ? 1 : 0,
        pending: p.status === "pending" ? 1 : 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const totalA = a.approved + a.denied + a.pending;
    const totalB = b.approved + b.denied + b.pending;
    return totalB - totalA;
  });
}

export function PermissionHistory({ permissions }: PermissionHistoryProps) {
  const aggregates = useMemo(() => aggregateByTool(permissions), [permissions]);
  const sorted = useMemo(
    () => [...permissions].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    }),
    [permissions],
  );

  if (permissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-dt-text3">
        <Shield size={32} />
        <p className="text-sm">No permission requests yet</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Tool Analytics */}
      <section>
        <h3 className="text-xs font-semibold text-dt-text2 uppercase tracking-wide mb-3">
          Tool Analytics
        </h3>
        <div className="space-y-2">
          {aggregates.map((agg) => (
            <div
              key={agg.toolName}
              className="flex items-center gap-3 px-3 py-2 rounded text-sm"
              style={{ backgroundColor: "var(--bg-s)" }}
            >
              <span className="font-mono font-bold text-dt-text flex-1">
                {agg.toolName}
              </span>
              {agg.approved > 0 && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ color: "var(--grn)" }}
                >
                  {agg.approved}
                </span>
              )}
              {agg.denied > 0 && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ color: "var(--red)" }}
                >
                  {agg.denied}
                </span>
              )}
              {agg.pending > 0 && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ color: "var(--amb)" }}
                >
                  {agg.pending}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      <section>
        <h3 className="text-xs font-semibold text-dt-text2 uppercase tracking-wide mb-3">
          History
        </h3>
        <div className="space-y-1">
          {sorted.map((p) => {
            const config = STATUS_CONFIG[p.status];
            const Icon = config.icon;
            return (
              <div
                key={p.id}
                className="flex items-start gap-3 px-3 py-2 rounded text-sm"
                style={{ backgroundColor: "var(--bg-s)" }}
              >
                <Icon
                  size={16}
                  className="shrink-0 mt-0.5"
                  style={{ color: config.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-dt-text">
                      {p.toolName}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-dt-text3 truncate mt-0.5">
                    {summarizeInput(p.input)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
