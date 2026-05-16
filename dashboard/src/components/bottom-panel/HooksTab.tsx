import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import type {
  SessionEvent,
  AttachmentEvent,
  HookSuccessAttachment,
  HookCancelledAttachment,
  AsyncHookResponseAttachment,
  QueuedCommandAttachment,
} from "../../lib/types";

interface HooksTabProps {
  events?: SessionEvent[];
  /** Currently viewed turn — filters hooks to that turn when set. */
  activeTurnIndex?: number | null;
  /**
   * FU-3 — fired on row hover with the row's `toolUseID` (or `null` on leave).
   * Only invoked for rows whose `toolUseID` is truthy. Monitor / async-only
   * rows that don't correlate to a tool call don't dispatch.
   */
  onHookHover?: (toolUseID: string | null) => void;
  /**
   * FU-3 — id of the tool_use currently hovered in the conversation view.
   * Rows whose `toolUseID` matches get a subtle purple-dim background tint.
   */
  highlightedHookId?: string | null;
}

/** Origin of the row — drives the "Source" column. */
type HookSource = "hook" | "Monitor";

interface HookRow {
  uuid: string;
  timestamp: string;
  hookEvent: string;
  hookName: string;
  source: HookSource;
  toolUseID?: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  stdoutPreview: string;
  stderrPreview: string;
  cancelled: boolean;
  cancelReason?: string;
  /** Literal terminal escape sequence (CC v2.1.143 hook output field). */
  terminalSequence?: string;
}

function isHookAttachment(e: SessionEvent): e is AttachmentEvent {
  if (e.type !== "attachment") return false;
  const inner = (e as AttachmentEvent).attachment;
  if (!inner) return false;
  if (
    inner.type === "hook_success" ||
    inner.type === "hook_cancelled" ||
    inner.type === "async_hook_response"
  ) {
    return true;
  }
  // task-notification queued_commands are Monitor / TaskCreate fan-outs —
  // background event reports (e.g. "build complete"). They share the Hooks
  // tab because they're machine-emitted side-effects, not user prompts.
  // commandMode === "prompt" is user input — keep that filtered out.
  if (inner.type === "queued_command") {
    return (inner as QueuedCommandAttachment).commandMode === "task-notification";
  }
  return false;
}

/**
 * Extract the inner text of the first <summary>...</summary> tag from a
 * task-notification prompt. Returns the full prompt if no summary is found.
 */
function extractTaskNotificationSummary(prompt: string): string {
  const match = prompt.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (match && match[1]) return match[1].trim();
  return prompt;
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
      source: "hook",
      toolUseID: a.toolUseID,
      command: a.command,
      exitCode: a.exitCode,
      durationMs: a.durationMs,
      stdoutPreview: truncate(a.stdout),
      stderrPreview: truncate(a.stderr),
      cancelled: false,
      terminalSequence: a.terminalSequence,
    };
  }
  if (inner.type === "hook_cancelled") {
    const a = inner as HookCancelledAttachment;
    return {
      uuid: e.uuid,
      timestamp: e.timestamp,
      hookEvent: a.hookEvent ?? "<unknown>",
      hookName: a.hookName ?? "<unknown>",
      source: "hook",
      stdoutPreview: "",
      stderrPreview: "",
      cancelled: true,
      cancelReason: a.reason,
    };
  }
  // async_hook_response — PostToolUse with full tool execution payload
  if (inner.type === "async_hook_response") {
    const a = inner as AsyncHookResponseAttachment;
    return {
      uuid: e.uuid,
      timestamp: e.timestamp,
      hookEvent: a.hookEvent ?? "PostToolUse",
      hookName: a.hookName ?? "<async>",
      source: "hook",
      // Surface the underlying tool name so the row tells the operator
      // which tool the hook reported on (Bash, Read, etc.).
      toolUseID: a.response?.tool_name
        ? `${a.response.tool_name}`
        : undefined,
      durationMs: a.response?.duration_ms,
      stdoutPreview: truncate(a.response?.tool_response?.stdout),
      stderrPreview: truncate(a.response?.tool_response?.stderr),
      cancelled: false,
    };
  }
  // queued_command with commandMode === "task-notification" — Monitor /
  // TaskCreate fan-out. We only show the <summary> tag content as the
  // preview to keep the row scannable.
  if (inner.type === "queued_command") {
    const a = inner as QueuedCommandAttachment;
    if (a.commandMode !== "task-notification") return null;
    const summary = extractTaskNotificationSummary(a.prompt ?? "");
    return {
      uuid: e.uuid,
      timestamp: e.timestamp,
      hookEvent: "TaskNotification",
      hookName: "Monitor",
      source: "Monitor",
      stdoutPreview: truncate(summary, 120),
      stderrPreview: "",
      cancelled: false,
    };
  }

  return null;
}

export function HooksTab({
  events = [],
  activeTurnIndex: _,
  onHookHover,
  highlightedHookId = null,
}: HooksTabProps): JSX.Element {
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
      totalMs,
    };
  }, [rows]);

  const fmtTotal = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

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
          <span title="Average hook duration">avg {stats.avgMs.toFixed(0)}ms</span>
        )}
        {stats.totalMs > 0 && (
          <span title="Total time spent in hooks across the session">
            total {fmtTotal(stats.totalMs)}
          </span>
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
              <th className="text-left px-2 py-1 font-normal">Source</th>
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
              const isHighlighted =
                highlightedHookId != null &&
                r.toolUseID != null &&
                r.toolUseID === highlightedHookId;
              const handleMouseEnter = (): void => {
                if (onHookHover && r.toolUseID) onHookHover(r.toolUseID);
              };
              const handleMouseLeave = (): void => {
                if (onHookHover && r.toolUseID) onHookHover(null);
              };
              return (
                <tr
                  key={r.uuid}
                  data-testid={`hook-row-${r.uuid}`}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  style={{
                    borderBottom: "1px solid var(--bd)",
                    color: rowColor,
                    background: isHighlighted ? "var(--cat-purple-bg)" : undefined,
                  }}
                >
                  <td className="px-2 py-1" style={{ color: "var(--t3)" }}>
                    {r.source}
                  </td>
                  <td className="px-2 py-1" style={{ color: "var(--t2)" }}>
                    {r.hookEvent}
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1">
                      {r.hookName}
                      {r.terminalSequence && r.terminalSequence.length > 0 && (
                        <span
                          data-testid={`hook-row-${r.uuid}-terminal-bell`}
                          title={truncate(r.terminalSequence, 80)}
                          style={{ color: "var(--t3)", display: "inline-flex" }}
                          aria-label="terminal sequence emitted"
                          role="img"
                        >
                          <Bell size={11} />
                        </span>
                      )}
                    </span>
                  </td>
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
