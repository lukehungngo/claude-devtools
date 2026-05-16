import { useMemo, useState } from "react";
import type {
  SessionEvent,
  AttachmentEvent,
  HookSuccessAttachment,
  HookCancelledAttachment,
} from "../../lib/types";

interface HooksTabProps {
  events?: SessionEvent[];
  /** Currently viewed turn — filters hooks to that turn when set. */
  activeTurnIndex?: number | null;
}

interface HookRow {
  uuid: string;
  timestamp: string;
  hookEvent: string;
  hookName: string;
  toolUseID?: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  stdoutPreview: string;
  stderrPreview: string;
  cancelled: boolean;
  cancelReason?: string;
}

function isHookAttachment(e: SessionEvent): e is AttachmentEvent {
  if (e.type !== "attachment") return false;
  const inner = (e as AttachmentEvent).attachment?.type;
  return inner === "hook_success" || inner === "hook_cancelled" || inner === "async_hook_response";
}

function truncate(s: string | undefined, max = 80): string {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function toRow(e: AttachmentEvent): HookRow | null {
  const inner = e.attachment;
  if (inner.type === "hook_success") {
    const a = inner as HookSuccessAttachment;
    return {
      uuid: e.uuid,
      timestamp: e.timestamp,
      hookEvent: a.hookEvent,
      hookName: a.hookName,
      toolUseID: a.toolUseID,
      command: a.command,
      exitCode: a.exitCode,
      durationMs: a.durationMs,
      stdoutPreview: truncate(a.stdout),
      stderrPreview: truncate(a.stderr),
      cancelled: false,
    };
  }
  if (inner.type === "hook_cancelled") {
    const a = inner as HookCancelledAttachment;
    return {
      uuid: e.uuid,
      timestamp: e.timestamp,
      hookEvent: a.hookEvent ?? "<unknown>",
      hookName: a.hookName ?? "<unknown>",
      stdoutPreview: "",
      stderrPreview: "",
      cancelled: true,
      cancelReason: a.reason,
    };
  }
  // async_hook_response — passthrough as opaque event
  return {
    uuid: e.uuid,
    timestamp: e.timestamp,
    hookEvent: (inner as { hookEvent?: string }).hookEvent ?? "async_hook_response",
    hookName: (inner as { hookName?: string }).hookName ?? "<async>",
    stdoutPreview: "",
    stderrPreview: "",
    cancelled: false,
  };
}

export function HooksTab({ events = [], activeTurnIndex: _ }: HooksTabProps): JSX.Element {
  const rows = useMemo<HookRow[]>(() => {
    return events.filter(isHookAttachment).map(toRow).filter((r): r is HookRow => r !== null);
  }, [events]);

  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState<string>("");

  const hookEventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.hookEvent);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (filterEvent && r.hookEvent !== filterEvent) return false;
      if (!q) return true;
      return (
        r.hookName.toLowerCase().includes(q) ||
        (r.command ?? "").toLowerCase().includes(q) ||
        r.stdoutPreview.toLowerCase().includes(q) ||
        r.stderrPreview.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterEvent]);

  const stats = useMemo(() => {
    let total = rows.length;
    let nonzeroExit = 0;
    let cancelled = 0;
    let totalMs = 0;
    let withDuration = 0;
    for (const r of rows) {
      if (r.exitCode != null && r.exitCode !== 0) nonzeroExit += 1;
      if (r.cancelled) cancelled += 1;
      if (r.durationMs != null) {
        totalMs += r.durationMs;
        withDuration += 1;
      }
    }
    return {
      total,
      nonzeroExit,
      cancelled,
      avgMs: withDuration > 0 ? totalMs / withDuration : 0,
    };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="px-3 py-2 t-mono-sm" style={{ color: "var(--t3)" }}>
        No hook executions recorded for this session.
      </div>
    );
  }

  return (
    <div data-testid="hooks-tab" className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b t-mono-sm"
        style={{ borderColor: "var(--bd)", color: "var(--t2)" }}
      >
        <span>
          <strong style={{ color: "var(--t1)" }}>{stats.total}</strong> hook
          {stats.total === 1 ? "" : "s"}
        </span>
        {stats.nonzeroExit > 0 && (
          <span style={{ color: "var(--err)" }}>{stats.nonzeroExit} failed</span>
        )}
        {stats.cancelled > 0 && (
          <span style={{ color: "var(--amb)" }}>{stats.cancelled} cancelled</span>
        )}
        {stats.avgMs > 0 && (
          <span>avg {stats.avgMs.toFixed(0)}ms</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            data-testid="hooks-event-filter"
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="t-mono-sm"
            style={{
              background: "var(--bg)",
              color: "var(--t1)",
              border: "1px solid var(--bd)",
              borderRadius: 3,
              padding: "1px 4px",
            }}
          >
            <option value="">All events</option>
            {hookEventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            data-testid="hooks-search"
            type="text"
            placeholder="filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="t-mono-sm"
            style={{
              background: "var(--bg)",
              color: "var(--t1)",
              border: "1px solid var(--bd)",
              borderRadius: 3,
              padding: "1px 4px",
              width: 120,
            }}
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        <table className="w-full t-mono-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--t3)", background: "var(--bg-h)" }}>
              <th className="text-left px-2 py-1 font-normal">Event</th>
              <th className="text-left px-2 py-1 font-normal">Hook</th>
              <th className="text-left px-2 py-1 font-normal">Tool use</th>
              <th className="text-right px-2 py-1 font-normal">ms</th>
              <th className="text-right px-2 py-1 font-normal">Exit</th>
              <th className="text-left px-2 py-1 font-normal">Output</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const failed = r.exitCode != null && r.exitCode !== 0;
              const rowColor = r.cancelled
                ? "var(--amb)"
                : failed
                ? "var(--err)"
                : "var(--t1)";
              return (
                <tr
                  key={r.uuid}
                  data-testid={`hook-row-${r.uuid}`}
                  style={{ borderBottom: "1px solid var(--bd)", color: rowColor }}
                >
                  <td className="px-2 py-1" style={{ color: "var(--t2)" }}>
                    {r.hookEvent}
                  </td>
                  <td className="px-2 py-1">{r.hookName}</td>
                  <td className="px-2 py-1" style={{ color: "var(--t3)" }}>
                    {r.toolUseID ?? ""}
                  </td>
                  <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
                    {r.durationMs != null ? r.durationMs : ""}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {r.cancelled
                      ? "cancel"
                      : r.exitCode != null
                      ? r.exitCode
                      : ""}
                  </td>
                  <td className="px-2 py-1" style={{ color: "var(--t2)" }}>
                    {r.cancelled
                      ? r.cancelReason ?? "cancelled"
                      : failed
                      ? r.stderrPreview || r.stdoutPreview
                      : r.stdoutPreview}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
