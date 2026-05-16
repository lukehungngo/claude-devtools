import { memo, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import type { SessionTask } from "../../lib/sessionTasks";

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
      return STATUS_DISPLAY.in_progress;
    case "pending":
      return STATUS_DISPLAY.pending;
    case "deleted":
      return { label: "deleted", color: "var(--t3)", symbol: "—" };
    default:
      // Unknown daemon status — render the raw string so it's visible in the
      // UI rather than silently swallowed.
      return { label: status, color: "var(--t2)", symbol: "?" };
  }
}

export const TasksTab = memo(function TasksTab({
  tasks,
  sessionId,
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
    return <DaemonTasksTable tasks={daemonTasks} />;
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
}

function DaemonTasksTable({ tasks }: DaemonTasksTableProps) {
  const completedCount = tasks.filter((t) => t.status === "completed").length;

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
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const status = daemonStatusDisplay(task.status);
              const isDone = task.status === "completed";
              const blockedByCount = task.blockedBy.length;
              const blockedByTitle =
                blockedByCount > 0
                  ? `Blocked by: ${task.blockedBy.join(", ")}`
                  : undefined;
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
                      color: isDone ? "var(--t3)" : "var(--t1)",
                      textDecoration: isDone ? "line-through" : "none",
                      padding: "5px 12px",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{task.subject}</span>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
