import { memo } from "react";
import { CheckCircle, Loader, Circle } from "lucide-react";
import type { TodoTask } from "../../lib/extractTasks";

interface TasksTabProps {
  tasks: TodoTask[];
}

const STATUS_LABEL: Record<TodoTask["status"], string> = {
  completed: "done",
  in_progress: "running",
  pending: "pending",
};

export const TasksTab = memo(function TasksTab({ tasks }: TasksTabProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--t3)" }}>
        No tasks
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="flex flex-col h-full">
      <div
        className="shrink-0 px-3 py-2 font-mono"
        style={{ fontSize: 11, color: "var(--t2)", borderBottom: "1px solid var(--bd)" }}
      >
        {completedCount}/{tasks.length} completed
      </div>
      <div className="overflow-y-auto h-full" role="list">
        {tasks.map((task) => (
          <div
            key={task.id}
            role="listitem"
            className="flex items-start gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid var(--bd)" }}
          >
            <div className="shrink-0 mt-[1px]">
              {task.status === "completed" ? (
                <CheckCircle size={12} aria-hidden style={{ color: "var(--grn)" }} />
              ) : task.status === "in_progress" ? (
                <Loader size={12} aria-hidden style={{ color: "var(--amb)" }} />
              ) : (
                <Circle size={12} aria-hidden style={{ color: "var(--t3)" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                style={{
                  fontSize: 12,
                  color: task.status === "completed" ? "var(--t3)" : "var(--t1)",
                  textDecoration: task.status === "completed" ? "line-through" : "none",
                }}
              >
                {task.title}
              </div>
              {task.description && (
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
                  {task.description}
                </div>
              )}
            </div>
            <div
              className="shrink-0 font-mono uppercase"
              style={{
                fontSize: 9,
                color:
                  task.status === "completed"
                    ? "var(--grn)"
                    : task.status === "in_progress"
                      ? "var(--amb)"
                      : "var(--t3)",
              }}
            >
              {STATUS_LABEL[task.status]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
