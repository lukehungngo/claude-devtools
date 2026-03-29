import { useMemo } from "react";
import { ListTodo, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { extractTasks, type TodoTask } from "../../lib/extractTasks";
import type { SessionEvent } from "../../lib/types";

interface TaskPanelProps {
  events: SessionEvent[];
}

const STATUS_ORDER: Record<TodoTask["status"], number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

function statusBadge(status: TodoTask["status"]): JSX.Element {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 text-xxs font-semibold px-2 py-0.5 rounded-full bg-dt-green-dim text-dt-green">
          <CheckCircle2 size={10} />
          done
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1 text-xxs font-semibold px-2 py-0.5 rounded-full bg-dt-yellow-dim text-dt-yellow">
          <Loader2 size={10} className="animate-spin" />
          in progress
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xxs font-semibold px-2 py-0.5 rounded-full bg-dt-bg3 text-dt-text2">
          <Circle size={10} />
          todo
        </span>
      );
  }
}

export function TaskPanel({ events }: TaskPanelProps): JSX.Element {
  const tasks = useMemo(() => extractTasks(events), [events]);

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    [tasks],
  );

  const completed = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="flex flex-col h-full overflow-auto p-5 gap-4">
      <div className="flex items-center gap-2.5">
        <ListTodo className="w-5 h-5 text-dt-text1" />
        <h2 className="text-lg font-semibold text-dt-text0 font-sans tracking-[-0.3px]">Tasks</h2>
        {tasks.length > 0 && (
          <span className="ml-auto text-xs font-mono text-dt-text2 bg-dt-bg3 px-2 py-0.5 rounded-full">
            {completed} / {tasks.length}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-dt-text2">
          No tasks in this session. Tasks appear when Claude uses TodoWrite.
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
            <div
              className="h-full bg-dt-green rounded-full transition-all duration-300"
              style={{ width: `${(completed / tasks.length) * 100}%` }}
            />
          </div>

          <div className="flex flex-col gap-2">
            {sorted.map((task) => (
              <div
                key={task.id}
                className={`flex flex-col gap-1.5 px-4 py-3 rounded-dt-md border border-dt-border bg-dt-bg2 transition-all duration-200 ${
                  task.status === "completed" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={task.status === "completed"}
                    readOnly
                    className="accent-dt-green pointer-events-none"
                    aria-label={`${task.title} ${task.status === "completed" ? "completed" : "not completed"}`}
                  />
                  <span
                    data-testid="task-title"
                    className={`text-sm font-medium ${
                      task.status === "completed"
                        ? "text-dt-text2 line-through"
                        : "text-dt-text0"
                    }`}
                  >
                    {task.title}
                  </span>
                  <span className="ml-auto shrink-0">{statusBadge(task.status)}</span>
                </div>
                {task.description && (
                  <p className="text-xs text-dt-text2 pl-7">{task.description}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
