import { useMemo, useState } from "react";
import { CheckCircle, XCircle, Clock, Shield, CheckSquare2, Square, Check, X } from "lucide-react";
import type { PermissionRequest } from "../../lib/types";

interface PermissionHistoryProps {
  permissions: PermissionRequest[];
  onDecide?: (id: string, decision: "approved" | "denied") => void;
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

export function PermissionHistory({ permissions, onDecide }: PermissionHistoryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchInFlight, setBatchInFlight] = useState(false);
  const [batchFailCount, setBatchFailCount] = useState(0);

  const aggregates = useMemo(() => aggregateByTool(permissions), [permissions]);
  const sorted = useMemo(
    () => [...permissions].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    }),
    [permissions],
  );

  const pendingPermissions = useMemo(
    () => permissions.filter((p) => p.status === "pending"),
    [permissions],
  );

  const allPendingSelected =
    pendingPermissions.length > 0 &&
    pendingPermissions.every((p) => selectedIds.has(p.id));

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllToggle() {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingPermissions.map((p) => p.id)));
    }
  }

  async function handleBatchAction(decision: "approved" | "denied") {
    if (!onDecide || batchInFlight) return;

    // Only act on IDs that are still pending at action time
    const idsToAct = permissions
      .filter((p) => selectedIds.has(p.id) && p.status === "pending")
      .map((p) => p.id);

    if (idsToAct.length === 0) return;

    setBatchInFlight(true);
    setBatchFailCount(0);
    try {
      const results = await Promise.allSettled(idsToAct.map((id) => onDecide(id, decision)));
      const failures = results.filter((r) => r.status === "rejected").length;
      if (failures > 0) setBatchFailCount(failures);
    } finally {
      setSelectedIds(new Set());
      setBatchInFlight(false);
    }
  }

  if (permissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-dt-text3">
        <Shield size={32} />
        <p className="text-sm">No permission requests yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-dt-text2 uppercase tracking-wide">
              History
            </h3>
            {onDecide && pendingPermissions.length > 0 && (
              <button
                className="text-xs text-dt-text3 hover:text-dt-text transition-colors"
                onClick={handleSelectAllToggle}
                aria-label="Select all pending permissions"
                aria-pressed={allPendingSelected}
              >
                {allPendingSelected ? "Deselect all" : `Select all (${pendingPermissions.length})`}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {sorted.map((p) => {
              const config = STATUS_CONFIG[p.status];
              const Icon = config.icon;
              const isPending = p.status === "pending";
              const isSelected = selectedIds.has(p.id);

              return (
                <div
                  key={p.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded text-sm ${batchInFlight && isPending ? "opacity-50" : ""}`}
                  style={{ backgroundColor: "var(--bg-s)" }}
                >
                  {/* Checkbox column — 28px reserved for all rows for icon alignment */}
                  <div className="w-7 shrink-0 flex items-center justify-center mt-0.5">
                    {onDecide && isPending && (
                      <button
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select ${p.toolName} permission ${p.id}`}
                        className="p-1 rounded hover:bg-dt-surface2 transition-colors"
                        onClick={() => toggleId(p.id)}
                        disabled={batchInFlight}
                      >
                        {isSelected ? (
                          <CheckSquare2 size={16} className="text-dt-blue" />
                        ) : (
                          <Square size={16} className="text-dt-text3" />
                        )}
                      </button>
                    )}
                  </div>

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

      {/* Sticky Action Bar — only when items selected and onDecide provided */}
      {onDecide && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk permission actions"
          className="shrink-0 border-t border-dt-border px-4 py-3 flex items-center gap-2 flex-wrap"
          style={{ backgroundColor: "var(--bg-s)" }}
        >
          <span
            className="text-sm text-dt-text2 flex-1"
            aria-live="polite"
          >
            {selectedIds.size} selected
          </span>
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-dt-green/20 text-dt-green hover:bg-dt-green/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleBatchAction("approved")}
            disabled={batchInFlight}
            aria-label={`Approve ${selectedIds.size} selected permissions`}
            aria-disabled={batchInFlight}
          >
            <Check size={12} />
            Approve Selected ({selectedIds.size})
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-dt-red/20 text-dt-red hover:bg-dt-red/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleBatchAction("denied")}
            disabled={batchInFlight}
            aria-label={`Deny ${selectedIds.size} selected permissions`}
            aria-disabled={batchInFlight}
          >
            <X size={12} />
            Deny Selected ({selectedIds.size})
          </button>
          <button
            className="p-1.5 rounded hover:bg-dt-surface2 text-dt-text3 hover:text-dt-text transition-colors"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Batch failure notice */}
      {batchFailCount > 0 && (
        <div role="alert" className="shrink-0 px-4 py-2 text-xs text-dt-red bg-dt-red/10 border-t border-dt-border">
          {batchFailCount} decision{batchFailCount > 1 ? "s" : ""} failed to apply. Refresh and try again.
        </div>
      )}
    </div>
  );
}
