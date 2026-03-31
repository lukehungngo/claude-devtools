import { memo, useState } from "react";

interface Task {
  id: string;
  name: string;
  status: "done" | "pending" | "in_progress" | "error";
}

export interface TaskGridProps {
  tasks: Task[];
}

const STATUS_DISPLAY: Record<
  Task["status"],
  { label: string; color: string }
> = {
  done: { label: "\u2713", color: "var(--grn)" },
  pending: { label: "--", color: "var(--t3)" },
  in_progress: { label: "\u25CF", color: "var(--amb)" },
  error: { label: "\u2717", color: "var(--red)" },
};

export const TaskGrid = memo(function TaskGrid({
  tasks,
}: TaskGridProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="font-mono hover:underline"
        style={{ fontSize: 10, color: "var(--acc)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        +{tasks.length} tasks (click to expand)
      </button>

      {expanded && (
        <table
          style={{
            width: "100%",
            border: "1px solid var(--bd)",
            borderRadius: 4,
            overflow: "hidden",
            borderCollapse: "collapse",
            marginTop: 4,
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
                  padding: "4px 8px",
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
                  padding: "4px 8px",
                }}
              >
                Task
              </th>
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
                  textAlign: "right",
                  padding: "4px 8px",
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
                <tr key={task.id} style={{ borderBottom: "1px solid var(--bd)" }}>
                  <td
                    className="font-mono"
                    style={{ width: 60, fontSize: 9, color: "var(--t3)", padding: "4px 8px" }}
                  >
                    {task.id}
                  </td>
                  <td
                    className="font-mono"
                    style={{ fontSize: 9, color: "var(--t1)", padding: "4px 8px" }}
                  >
                    {task.name}
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      width: 60,
                      fontSize: 9,
                      color: status.color,
                      textAlign: "right",
                      padding: "4px 8px",
                    }}
                  >
                    {status.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
});
