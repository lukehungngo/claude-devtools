import { Fragment, memo, useCallback, useEffect, useState } from "react";
import { Link2, Moon, Trash2 } from "lucide-react";
import type { SessionTask } from "../../lib/sessionTasks";
import type { LiveTaskState } from "../../lib/streaming-types";

/**
 * Mirrors the server-side `DaemonTaskRecord` shape returned by
 * `GET /api/sessions/:sessionId/tasks/daemon`. Kept inline (no shared types
 * change) to avoid touching `dashboard/src/lib/types.ts` — that file is owned
 * by TASK-R2B2 in this round.
 */
interface DaemonTaskRecord {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  status: string;
  blocks: string[];
  blockedBy: string[];
}

interface TasksTabProps {
  tasks: SessionTask[];
  /**
   * When provided, TasksTab fetches `/api/sessions/<sessionId>/tasks/daemon`
   * once on mount. Non-empty daemon responses take precedence over the
   * JSONL-derived `tasks` prop; empty responses or failures fall back to
   * the JSONL list. Omit `sessionId` to disable the daemon fetch entirely
   * (e.g. when no active session is selected).
   */
  sessionId?: string;
  /**
   * NEW-7: live task state from SDK task lifecycle messages, keyed by
   * task_id. When a daemon row's id matches a key in this map the live
   * fields (status, tokens/duration, is_backgrounded, last_tool_name)
   * override the daemon snapshot.
   */
  liveTasks?: ReadonlyMap<string, LiveTaskState>;
}

const STATUS_DISPLAY: Record<
  SessionTask["status"],
  { label: string; color: string; symbol: string }
> = {
  done: { label: "done", color: "var(--grn)", symbol: "✓" },
  pending: { label: "pending", color: "var(--t3)", symbol: "--" },
  in_progress: { label: "running", color: "var(--amb)", symbol: "●" },
  error: { label: "error", color: "var(--red)", symbol: "✗" },
};

/** Normalize daemon statuses onto the `SessionTask` symbol/color palette. */
function daemonStatusDisplay(status: string): {
  label: string;
  color: string;
  symbol: string;
} {
  switch (status) {
    case "completed":
      return STATUS_DISPLAY.done;
    case "in_progress":
    case "running":
      return STATUS_DISPLAY.in_progress;
    case "pending":
      return STATUS_DISPLAY.pending;
    case "deleted":
      return { label: "deleted", color: "var(--t3)", symbol: "—" };
    case "failed":
      return STATUS_DISPLAY.error;
    case "paused":
      return { label: "paused", color: "var(--t3)", symbol: "❚❚" };
    case "stopped":
      return { label: "stopped", color: "var(--t3)", symbol: "✗" };
    case "killed":
      // Optimistic local-only status surfaced after a successful stop-task
      // POST. NEW-7 also maps SDKTaskUpdatedMessage `killed` to this label.
      return { label: "killed", color: "var(--t3)", symbol: "✗" };
    default:
      // Unknown daemon status — render the raw string so it's visible in the
      // UI rather than silently swallowed.
      return { label: status, color: "var(--t2)", symbol: "?" };
  }
}

/**
 * NEW-7: map a LiveTaskState.status (SDK union) onto the daemon status
 * vocabulary that `daemonStatusDisplay` understands. The two unions overlap
 * but use different spellings — "running" vs "in_progress", "failed" is
 * SDK-only, etc.
 */
function liveStatusToDaemonStatus(live: LiveTaskState["status"]): string {
  switch (live) {
    case "running":
      return "in_progress";
    case "pending":
      return "pending";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "killed":
      return "killed";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    default:
      return live;
  }
}

function formatDurationMs(ms: number | undefined): string {
  if (!ms || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export const TasksTab = memo(function TasksTab({
  tasks,
  sessionId,
  liveTasks,
}: TasksTabProps) {
  const [daemonTasks, setDaemonTasks] = useState<DaemonTaskRecord[] | null>(
    null,
  );

  useEffect(() => {
    if (!sessionId) {
      setDaemonTasks(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/tasks/daemon`);
        if (!res.ok) {
          if (!cancelled) setDaemonTasks(null);
          return;
        }
        const body = (await res.json()) as { tasks?: DaemonTaskRecord[] };
        if (cancelled) return;
        const arr = Array.isArray(body.tasks) ? body.tasks : [];
        setDaemonTasks(arr);
      } catch {
        // Network error / non-JSON / cancelled — fall back silently to the
        // JSONL-derived `tasks` prop.
        if (!cancelled) setDaemonTasks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const useDaemon = daemonTasks !== null && daemonTasks.length > 0;

  if (useDaemon) {
    return (
      <DaemonTasksTable
        tasks={daemonTasks}
        sessionId={sessionId}
        liveTasks={liveTasks}
      />
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--t3)" }}
      >
        No tasks
      </div>
    );
  }

  return <SessionTasksTable tasks={tasks} />;
});

interface SessionTasksTableProps {
  tasks: SessionTask[];
}

function SessionTasksTable({ tasks }: SessionTasksTableProps) {
  const completedCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="flex flex-col h-full">
      <div
        className="shrink-0 px-3 py-2 font-mono"
        style={{
          fontSize: 11,
          color: "var(--t2)",
          borderBottom: "1px solid var(--bd)",
        }}
      >
        {completedCount}/{tasks.length} completed in this turn
      </div>
      <div className="overflow-y-auto h-full" role="list">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th
                className="font-mono"
                style={{
                  width: 60,
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "left",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                ID
              </th>
              <th
                className="font-mono"
                style={{
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "left",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                Task
              </th>
              <th
                className="font-mono"
                style={{
                  width: 80,
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "right",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const status = STATUS_DISPLAY[task.status];
              return (
                <tr
                  key={task.id}
                  role="listitem"
                  style={{ borderBottom: "1px solid var(--bd)" }}
                >
                  <td
                    className="font-mono"
                    style={{
                      width: 60,
                      fontSize: 10,
                      color: "var(--t3)",
                      padding: "5px 12px",
                    }}
                  >
                    {task.id}
                  </td>
                  <td
                    style={{
                      fontSize: 11,
                      color:
                        task.status === "done" ? "var(--t3)" : "var(--t1)",
                      textDecoration:
                        task.status === "done" ? "line-through" : "none",
                      padding: "5px 12px",
                    }}
                  >
                    {task.name}
                  </td>
                  <td
                    className="font-mono uppercase"
                    style={{
                      width: 80,
                      fontSize: 9,
                      color: status.color,
                      textAlign: "right",
                      padding: "5px 12px",
                    }}
                  >
                    {status.symbol} {status.label}
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

interface DaemonTasksTableProps {
  tasks: DaemonTaskRecord[];
  sessionId?: string;
  /** NEW-7: live task lifecycle overlay keyed by task_id. */
  liveTasks?: ReadonlyMap<string, LiveTaskState>;
}

/**
 * Daemon statuses for which the task is still in-flight and may be stopped.
 * Mirrors the daemon emitter — see `parser/daemon-task-discovery.ts`.
 */
const STOPPABLE_DAEMON_STATUSES: ReadonlySet<string> = new Set([
  "in_progress",
  "pending",
  "running",
]);

function DaemonTasksTable({ tasks, sessionId, liveTasks }: DaemonTasksTableProps) {
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const [killedIds, setKilledIds] = useState<Set<string>>(() => new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const openConfirm = useCallback((id: string) => setConfirmingId(id), []);
  const cancelConfirm = useCallback(() => setConfirmingId(null), []);
  const confirmStop = useCallback(
    async (id: string) => {
      setConfirmingId(null);
      if (!sessionId) return;
      setKilledIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        await fetch(`/api/sessions/${sessionId}/stop-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: id }),
        });
      } catch {
        // Network error: leave optimistic 'killed' until next refresh.
      }
    },
    [sessionId],
  );

  return (
    <div className="flex flex-col h-full">
      <div
        className="shrink-0 px-3 py-2 font-mono"
        style={{
          fontSize: 11,
          color: "var(--t2)",
          borderBottom: "1px solid var(--bd)",
        }}
      >
        {completedCount}/{tasks.length} completed
      </div>
      <div className="overflow-y-auto h-full" role="list">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th
                className="font-mono"
                style={{
                  width: 60,
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "left",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                ID
              </th>
              <th
                className="font-mono"
                style={{
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "left",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                Task
              </th>
              <th
                className="font-mono"
                style={{
                  width: 80,
                  background: "var(--bg-h)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  fontSize: 9,
                  color: "var(--t2)",
                  textAlign: "right",
                  padding: "4px 12px",
                  position: "sticky",
                  top: 0,
                }}
              >
                Status
              </th>
              <th
                aria-label="Stop"
                style={{
                  width: 36,
                  background: "var(--bg-h)",
                  padding: "4px 8px",
                  position: "sticky",
                  top: 0,
                }}
              />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const isKilled = killedIds.has(task.id);
              // NEW-7: live SDK state takes precedence over the daemon snapshot
              // when both reference the same task_id.
              const live = liveTasks?.get(task.id);
              const liveDaemonStatus = live
                ? liveStatusToDaemonStatus(live.status)
                : undefined;
              const effectiveStatus = isKilled
                ? "killed"
                : liveDaemonStatus ?? task.status;
              const status = daemonStatusDisplay(effectiveStatus);
              const isDone =
                effectiveStatus === "completed" ||
                effectiveStatus === "failed" ||
                effectiveStatus === "stopped";
              const isStoppable =
                !isKilled &&
                !isDone &&
                STOPPABLE_DAEMON_STATUSES.has(task.status);
              const isConfirming = confirmingId === task.id;
              const blockedByCount = task.blockedBy.length;
              const blockedByTitle =
                blockedByCount > 0
                  ? `Blocked by: ${task.blockedBy.join(", ")}`
                  : undefined;
              const showLiveCounter =
                live && (live.totalTokens != null || live.durationMs != null);
              const counterTokens = live?.totalTokens ?? 0;
              const counterToolUses = live?.toolUses ?? 0;
              const counterDuration = formatDurationMs(live?.durationMs);
              const lastTool = live?.lastToolName;
              const isBackgrounded = live?.isBackgrounded === true;
              return (
                <Fragment key={task.id}>
                  <tr
                    role="listitem"
                    style={{ borderBottom: "1px solid var(--bd)" }}
                  >
                    <td
                      className="font-mono"
                      style={{
                        width: 60,
                        fontSize: 10,
                        color: "var(--t3)",
                        padding: "5px 12px",
                      }}
                    >
                      {task.id}
                    </td>
                    <td
                      style={{
                        fontSize: 11,
                        color: isDone ? "var(--t3)" : "var(--t1)",
                        textDecoration: isDone ? "line-through" : "none",
                        padding: "5px 12px",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{task.subject}</span>
                        {isBackgrounded ? (
                          <span
                            data-live-backgrounded={task.id}
                            title="Backgrounded (running in the background)"
                            aria-label="Backgrounded"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              color: "var(--t3)",
                            }}
                          >
                            <Moon size={11} aria-hidden="true" />
                          </span>
                        ) : null}
                        {lastTool ? (
                          <span
                            data-testid={`live-last-tool-${task.id}`}
                            title={`Last tool: ${lastTool}`}
                            style={{
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: 10,
                              color: "var(--t3)",
                              padding: "0 4px",
                              border: "1px solid var(--bd)",
                              borderRadius: 3,
                            }}
                          >
                            {lastTool}
                          </span>
                        ) : null}
                        {showLiveCounter ? (
                          <span
                            data-testid={`live-counter-${task.id}`}
                            title="Live: tokens · tool uses · duration"
                            style={{
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: 10,
                              color: "var(--t3)",
                            }}
                          >
                            {counterTokens}t · {counterToolUses}× · {counterDuration}
                          </span>
                        ) : null}
                        {blockedByCount > 0 && blockedByTitle ? (
                          <span
                            data-blocked-by={blockedByCount}
                            title={blockedByTitle}
                            aria-label={blockedByTitle}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                              color: "var(--t3)",
                              fontSize: 10,
                              fontFamily: "var(--font-mono, monospace)",
                            }}
                          >
                            <Link2 size={11} aria-hidden="true" />
                            {blockedByCount}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td
                      className="font-mono uppercase"
                      style={{
                        width: 80,
                        fontSize: 9,
                        color: status.color,
                        textAlign: "right",
                        padding: "5px 12px",
                      }}
                    >
                      {status.symbol} {status.label}
                    </td>
                    <td
                      style={{
                        width: 36,
                        padding: "5px 8px",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      {isStoppable ? (
                        <button
                          type="button"
                          data-stop-task={task.id}
                          data-testid={`stop-task-${task.id}`}
                          aria-label={`Stop task ${task.subject}`}
                          title={`Stop task: ${task.subject}`}
                          onClick={() => openConfirm(task.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 2,
                            cursor: "pointer",
                            color: "var(--t3)",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isConfirming ? (
                    <tr
                      data-testid={`stop-task-confirm-${task.id}`}
                      style={{
                        borderBottom: "1px solid var(--bd)",
                        background: "var(--bg-h)",
                      }}
                    >
                      <td
                        colSpan={4}
                        style={{
                          padding: "6px 12px",
                          fontSize: 11,
                          color: "var(--t1)",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            Stop task: <strong>{task.subject}</strong>?
                          </span>
                          <button
                            type="button"
                            onClick={cancelConfirm}
                            style={{
                              background: "transparent",
                              border: "1px solid var(--bd)",
                              color: "var(--t2)",
                              padding: "2px 8px",
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmStop(task.id)}
                            style={{
                              background: "var(--red, #c44)",
                              border: "1px solid var(--red, #c44)",
                              color: "white",
                              padding: "2px 8px",
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            Stop
                          </button>
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
