import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { TasksTab } from "./TasksTab";
import type { SessionTask } from "../../lib/sessionTasks";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TasksTab (JSONL-derived fallback)", () => {
  it("renders empty state when no tasks and no sessionId", () => {
    render(<TasksTab tasks={[]} />);
    expect(screen.getByText("No tasks")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders progress summary: 1/3 completed", () => {
    const tasks: SessionTask[] = [
      { id: "T-001", name: "Task A", status: "done" },
      { id: "T-002", name: "Task B", status: "in_progress" },
      { id: "T-003", name: "Task C", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("1/3 completed")).toBeDefined();
  });

  it("renders all task names", () => {
    const tasks: SessionTask[] = [
      { id: "T-001", name: "Write tests", status: "done" },
      { id: "T-002", name: "Implement feature", status: "in_progress" },
      { id: "T-003", name: "Deploy", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("Write tests")).toBeDefined();
    expect(screen.getByText("Implement feature")).toBeDefined();
    expect(screen.getByText("Deploy")).toBeDefined();
  });

  it("renders T-001-style ids", () => {
    const tasks: SessionTask[] = [
      { id: "T-001", name: "A", status: "done" },
      { id: "T-042", name: "B", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getByText("T-001")).toBeDefined();
    expect(screen.getByText("T-042")).toBeDefined();
  });

  it("renders status labels: done, running, pending", () => {
    const tasks: SessionTask[] = [
      { id: "T-001", name: "Done task", status: "done" },
      { id: "T-002", name: "Running task", status: "in_progress" },
      { id: "T-003", name: "Pending task", status: "pending" },
    ];
    render(<TasksTab tasks={tasks} />);
    expect(screen.getAllByText(/done/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/running/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pending/i).length).toBeGreaterThan(0);
  });
});

describe("TasksTab (daemon-authoritative)", () => {
  it("fetches the daemon endpoint when sessionId is provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tasks: [] }),
    });

    render(<TasksTab tasks={[]} sessionId="abc-123" />);
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/abc-123/tasks/daemon",
    );
  });

  it("prefers daemon tasks over the JSONL-derived list when present", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tasks: [
            {
              id: "1",
              subject: "Daemon task one",
              status: "completed",
              blocks: [],
              blockedBy: [],
            },
            {
              id: "2",
              subject: "Daemon task two",
              status: "in_progress",
              blocks: [],
              blockedBy: ["1"],
            },
          ],
        }),
    });

    const fallback: SessionTask[] = [
      { id: "T-001", name: "Fallback only", status: "pending" },
    ];

    render(<TasksTab tasks={fallback} sessionId="abc-123" />);
    await act(async () => {});

    expect(screen.getByText("Daemon task one")).toBeDefined();
    expect(screen.getByText("Daemon task two")).toBeDefined();
    expect(screen.queryByText("Fallback only")).toBeNull();
  });

  it("renders a chain icon (title='Blocked by: …') for tasks with blockedBy", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tasks: [
            {
              id: "1",
              subject: "Unblocked",
              status: "completed",
              blocks: ["2"],
              blockedBy: [],
            },
            {
              id: "2",
              subject: "Blocked one",
              status: "pending",
              blocks: [],
              blockedBy: ["1"],
            },
          ],
        }),
    });

    render(<TasksTab tasks={[]} sessionId="abc-123" />);
    await act(async () => {});

    const blockedRow = screen.getByText("Blocked one").closest("tr");
    expect(blockedRow).not.toBeNull();
    const chainIcon = blockedRow?.querySelector("[data-blocked-by]");
    expect(chainIcon).not.toBeNull();
    expect(chainIcon?.getAttribute("title")).toContain("Blocked by");
    expect(chainIcon?.getAttribute("title")).toContain("1");

    const unblockedRow = screen.getByText("Unblocked").closest("tr");
    expect(unblockedRow?.querySelector("[data-blocked-by]")).toBeNull();
  });

  it("falls back to JSONL-derived tasks when daemon returns empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tasks: [] }),
    });

    const fallback: SessionTask[] = [
      { id: "T-001", name: "JSONL only", status: "done" },
    ];

    render(<TasksTab tasks={fallback} sessionId="abc-123" />);
    await act(async () => {});

    expect(screen.getByText("JSONL only")).toBeDefined();
  });

  it("falls back to JSONL-derived tasks when daemon fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    const fallback: SessionTask[] = [
      { id: "T-001", name: "JSONL only", status: "done" },
    ];

    render(<TasksTab tasks={fallback} sessionId="abc-123" />);
    await act(async () => {});

    expect(screen.getByText("JSONL only")).toBeDefined();
  });
});

// NEW-6 — kill button + inline confirmation for live in-flight tasks.
describe("TasksTab kill button (NEW-6)", () => {
  it("renders a stop button on in_progress and pending rows", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tasks: [
            { id: "1", subject: "Running one", status: "in_progress", blocks: [], blockedBy: [] },
            { id: "2", subject: "Pending one", status: "pending", blocks: [], blockedBy: [] },
          ],
        }),
    });

    render(<TasksTab tasks={[]} sessionId="abc-123" />);
    await act(async () => {});

    const runningRow = screen.getByText("Running one").closest("tr");
    const pendingRow = screen.getByText("Pending one").closest("tr");
    expect(runningRow?.querySelector('[data-stop-task="1"]')).not.toBeNull();
    expect(pendingRow?.querySelector('[data-stop-task="2"]')).not.toBeNull();
  });

  it("hides the stop button for completed and deleted tasks", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tasks: [
            { id: "1", subject: "Done task", status: "completed", blocks: [], blockedBy: [] },
            { id: "2", subject: "Gone task", status: "deleted", blocks: [], blockedBy: [] },
            { id: "3", subject: "Live task", status: "in_progress", blocks: [], blockedBy: [] },
          ],
        }),
    });

    render(<TasksTab tasks={[]} sessionId="abc-123" />);
    await act(async () => {});

    expect(screen.getByText("Done task").closest("tr")?.querySelector('[data-stop-task="1"]')).toBeNull();
    expect(screen.getByText("Gone task").closest("tr")?.querySelector('[data-stop-task="2"]')).toBeNull();
    expect(screen.getByText("Live task").closest("tr")?.querySelector('[data-stop-task="3"]')).not.toBeNull();
  });

  it("opens an inline confirmation and POSTs { taskId } on confirm", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          tasks: [
            { id: "task-99", subject: "Refactor parser", status: "in_progress", blocks: [], blockedBy: [] },
          ],
        }),
    });

    render(<TasksTab tasks={[]} sessionId="sess-42" />);
    await act(async () => {});

    const trash = screen.getByTestId("stop-task-task-99");
    await act(async () => {
      fireEvent.click(trash);
    });

    expect(screen.getByText(/Stop task:/)).toBeDefined();
    expect(screen.getByTestId("stop-task-confirm-task-99")).toBeDefined();
    const confirmBtn = screen.getByRole("button", { name: /^stop$/i });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/sessions/sess-42/stop-task",
    );
    expect(postCall).toBeDefined();
    const init = postCall![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ taskId: "task-99" });
  });
});
