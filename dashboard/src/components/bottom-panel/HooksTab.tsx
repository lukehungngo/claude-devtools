import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import type {
  SessionEvent,
  AttachmentEvent,
  HookSuccessAttachment,
  HookCancelledAttachment,
  AsyncHookResponseAttachment,
  QueuedCommandAttachment,
} from "../../lib/types";
import type { LiveHookState } from "../../lib/streaming-types";
import { formatDuration } from "../../lib/cost";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

/**
 * NEW-8: how long a completed `LiveHookState` row stays visible after
 * `hook_response`. Buys the JSONL-source `hook_success` attachment time to
 * land without flickering the row in and out.
 */
const LIVE_HOOK_DROP_MS = 3_000;

interface HooksTabProps {
  events?: SessionEvent[];
  /**
   * Turn snapshots used to scope the hooks list to a single turn when
   * `activeTurnIndex` resolves to a valid index. Absent / empty falls back
   * to the whole-session view (Bug G — same pattern other tabs use).
   */
  turns?: TurnSnapshot[];
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
  /**
   * NEW-8: in-flight (and recently-completed) hooks streamed from the SDK
   * via `useStreamingState`. Rendered above the JSONL-source rows with a
   * spinner + live elapsed-time counter so the user sees hook activity
   * before the `hook_success` attachment lands on disk. Completed entries
   * stay visible for `LIVE_HOOK_DROP_MS` then drop, giving the JSONL row
   * time to take over without a visible flicker.
   */
  liveHooks?: ReadonlyMap<string, LiveHookState>;
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

/**
 * NEW-8: derive the visible live-hook list from the reducer-owned map.
 *
 * Behavior:
 * - In-flight rows (completed=false) are always visible.
 * - Completed rows stay visible for `LIVE_HOOK_DROP_MS` after the response
 *   landed (computed as `now - (startedAt + durationMs)`) and then drop —
 *   giving the JSONL `hook_success` attachment time to take over without a
 *   visible flicker.
 *
 * Triggers a 1-second re-render while any live-hook entries are present so
 * the elapsed-time counter advances and the drop-window expires. Tears the
 * interval down when there's nothing live to display — costs nothing in
 * sessions with no hooks running.
 */
function useVisibleLiveHooks(
  liveHooks: ReadonlyMap<string, LiveHookState> | undefined,
): LiveHookState[] {
  const [tick, setTick] = useState(0);

  const hasAnyLive = liveHooks != null && liveHooks.size > 0;

  useEffect(() => {
    if (!hasAnyLive) return;
    const intervalId = setInterval(() => {
      setTick((t) => t + 1);
    }, 1_000);
    return () => clearInterval(intervalId);
  }, [hasAnyLive]);

  return useMemo(() => {
    if (!liveHooks || liveHooks.size === 0) return [];
    const now = Date.now();
    const visible: LiveHookState[] = [];
    for (const entry of liveHooks.values()) {
      if (!entry.completed) {
        visible.push(entry);
        continue;
      }
      const finishedAt = entry.startedAt + (entry.durationMs ?? 0);
      if (now - finishedAt <= LIVE_HOOK_DROP_MS) visible.push(entry);
    }
    return visible;
    // `tick` is intentionally included so the memo re-runs every second
    // even when `liveHooks` is the same reference — the drop window logic
    // depends on `Date.now()`, not on map identity, so the hook would
    // otherwise miss the LIVE_HOOK_DROP_MS expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveHooks, tick]);
}

interface LiveHookRowProps {
  hook: LiveHookState;
}

/**
 * NEW-8: a single in-flight or recently-completed hook row.
 *
 * Renders alongside the JSONL-source rows in the same table so columns stay
 * aligned. Spinner + elapsed-time counter only while `completed === false`;
 * completed rows show the SDK `durationMs` and `outcome` until the drop
 * window expires.
 */
function LiveHookRow({ hook }: LiveHookRowProps): JSX.Element {
  const isInFlight = !hook.completed;
  const elapsedMs = isInFlight ? Date.now() - hook.startedAt : (hook.durationMs ?? 0);
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const rowColor =
    hook.outcome === "error"
      ? "var(--err)"
      : hook.outcome === "cancelled"
      ? "var(--amb)"
      : "var(--t1)";
  const exitDisplay =
    hook.outcome === "cancelled"
      ? "cancel"
      : hook.exit_code != null
      ? String(hook.exit_code)
      : "";
  const outputPreview = truncate(hook.lastOutput);
  const safeId = hook.hook_id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return (
    <tr
      data-testid={`hook-row-live-${safeId}`}
      style={{
        borderBottom: "1px solid var(--bd)",
        color: rowColor,
        background: "var(--bg-h)",
      }}
    >
      <td className="px-2 py-1" style={{ color: "var(--t3)" }}>
        live
      </td>
      <td className="px-2 py-1" style={{ color: "var(--t2)" }}>
        {hook.hook_event}
      </td>
      <td className="px-2 py-1">
        <span className="inline-flex items-center gap-1">
          {hook.hook_name}
          {isInFlight && (
            <Loader2
              data-testid={`hook-row-live-${safeId}-spinner`}
              size={11}
              className="animate-spin"
              style={{ color: "var(--t3)" }}
              aria-label="hook running"
            />
          )}
        </span>
      </td>
      <td className="px-2 py-1" style={{ color: "var(--t3)" }}>
        {isInFlight ? (
          <span data-testid={`hook-row-live-${safeId}-elapsed`}>
            {elapsedSeconds}s
          </span>
        ) : (
          ""
        )}
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>
        {hook.durationMs ?? ""}
      </td>
      <td className="px-2 py-1 text-right">{exitDisplay}</td>
      <td className="px-2 py-1" style={{ color: "var(--t2)" }}>
        {outputPreview}
      </td>
    </tr>
  );
}

export function HooksTab({
  events = [],
  turns = [],
  activeTurnIndex,
  onHookHover,
  highlightedHookId = null,
  liveHooks,
}: HooksTabProps): JSX.Element {
  const rows = useMemo<HookRow[]>(() => {
    // Bug G — scope JSONL hook rows to the active turn when one is selected.
    // Falls back to the whole session when turns/activeTurnIndex are absent
    // or out of range. liveHooks are merged separately below so in-flight
    // entries attach to whatever scope view is current.
    const scopedEvents =
      activeTurnIndex != null && turns[activeTurnIndex]
        ? getEventsForTurn(turns[activeTurnIndex], events)
        : events;
    return scopedEvents
      .filter(isHookAttachment)
      .map(toRow)
      .filter((r): r is HookRow => r !== null);
  }, [events, turns, activeTurnIndex]);

  // NEW-8: surface in-flight (and recently-completed) live hooks above the
  // JSONL-source rows. We render them in their own <tbody> so the existing
  // row keys / hover wiring stay untouched.
  const visibleLiveHooks = useVisibleLiveHooks(liveHooks);

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

  if (rows.length === 0 && visibleLiveHooks.length === 0) {
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
            total {formatDuration(stats.totalMs)}
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
          <tbody data-testid="hooks-live-tbody">
            {visibleLiveHooks.map((h) => (
              <LiveHookRow key={`live-${h.hook_id}`} hook={h} />
            ))}
          </tbody>
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
