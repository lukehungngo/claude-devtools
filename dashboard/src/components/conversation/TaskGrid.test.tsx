import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TaskGrid } from "./TaskGrid";

afterEach(cleanup);

const sampleTasks = [
  { id: "TASK-001", name: "Setup project", status: "done" as const },
  { id: "TASK-002", name: "Build components", status: "pending" as const },
  { id: "TASK-003", name: "Deploy to prod", status: "error" as const },
];

describe("TaskGrid", () => {
  it("renders collapsed toggle with correct task count", () => {
    const { getByRole } = render(<TaskGrid tasks={sampleTasks} />);
    const button = getByRole("button");
    expect(button.textContent).toContain("+3 tasks");
    expect(button.textContent).toContain("click to expand");
  });

  it("expands table on toggle click showing header and 3 rows", () => {
    const { getByRole, getAllByRole } = render(
      <TaskGrid tasks={sampleTasks} />
    );
    const button = getByRole("button");
    fireEvent.click(button);

    const rows = getAllByRole("row");
    // 1 header row + 3 data rows
    expect(rows.length).toBe(4);
  });

  it("displays task IDs and names correctly", () => {
    const { getByRole, getByText } = render(
      <TaskGrid tasks={sampleTasks} />
    );
    fireEvent.click(getByRole("button"));

    expect(getByText("TASK-001")).toBeTruthy();
    expect(getByText("TASK-002")).toBeTruthy();
    expect(getByText("TASK-003")).toBeTruthy();
    expect(getByText("Setup project")).toBeTruthy();
    expect(getByText("Build components")).toBeTruthy();
    expect(getByText("Deploy to prod")).toBeTruthy();
  });

  it("shows correct status icons for done, pending, and error", () => {
    const { getByRole, container } = render(
      <TaskGrid tasks={sampleTasks} />
    );
    fireEvent.click(getByRole("button"));

    const rows = container.querySelectorAll("tr");
    // rows[0] is header, data rows start at index 1
    const statusCells = Array.from(rows).slice(1).map(
      (row) => row.lastElementChild as HTMLElement
    );

    // done -> checkmark
    expect(statusCells[0].textContent).toContain("\u2713");
    // pending -> --
    expect(statusCells[1].textContent).toContain("--");
    // error -> X mark
    expect(statusCells[2].textContent).toContain("\u2717");
  });

  it("collapses table on second toggle click", () => {
    const { getByRole, queryAllByRole } = render(
      <TaskGrid tasks={sampleTasks} />
    );
    const button = getByRole("button");

    fireEvent.click(button);
    expect(queryAllByRole("row").length).toBe(4);

    fireEvent.click(button);
    expect(queryAllByRole("row").length).toBe(0);
  });

  it("returns null when tasks array is empty", () => {
    const { container } = render(<TaskGrid tasks={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("has aria-expanded attribute on toggle button", () => {
    const { getByRole } = render(<TaskGrid tasks={sampleTasks} />);
    const button = getByRole("button");

    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows in_progress status with bullet indicator", () => {
    const tasks = [
      { id: "TASK-004", name: "Running tests", status: "in_progress" as const },
    ];
    const { getByRole, container } = render(<TaskGrid tasks={tasks} />);
    fireEvent.click(getByRole("button"));

    const rows = container.querySelectorAll("tr");
    const statusCell = rows[1].lastElementChild as HTMLElement;
    expect(statusCell.textContent).toContain("\u25CF");
  });
});
