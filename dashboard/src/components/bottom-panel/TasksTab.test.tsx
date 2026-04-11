import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TasksTab } from "./TasksTab";
import type { TodoTask } from "../../lib/extractTasks";

afterEach(cleanup);

describe("TasksTab", () => {
  it("renders empty state when no tasks", () => {
    render(<TasksTab tasks={[]} />);
    expect(screen.getByText("No tasks")).toBeDefined();
  });

  it("renders progress summary: 1/3 completed", () => {
    const tasks: TodoTask[] = [
      { id: "1", title: "Task A", status: "completed" },
      { id: "2", title: "Task B", status: "in_progress" },
      { id: "3", title: "Task C", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("1/3 completed")).toBeDefined();
  });

  it("renders all task titles", () => {
    const tasks: TodoTask[] = [
      { id: "1", title: "Write tests", status: "completed" },
      { id: "2", title: "Implement feature", status: "in_progress" },
      { id: "3", title: "Deploy", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("Write tests")).toBeDefined();
    expect(screen.getByText("Implement feature")).toBeDefined();
    expect(screen.getByText("Deploy")).toBeDefined();
  });

  it("renders task descriptions when present", () => {
    const tasks: TodoTask[] = [
      { id: "1", title: "Task with desc", status: "pending", description: "This is a description" },
      { id: "2", title: "Task without desc", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("This is a description")).toBeDefined();
    expect(screen.queryByText("undefined")).toBeNull();
  });

  it("renders status labels: done, running, pending", () => {
    const tasks: TodoTask[] = [
      { id: "1", title: "Done task", status: "completed" },
      { id: "2", title: "Running task", status: "in_progress" },
      { id: "3", title: "Pending task", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("done")).toBeDefined();
    expect(screen.getByText("running")).toBeDefined();
    expect(screen.getByText("pending")).toBeDefined();
  });
});
