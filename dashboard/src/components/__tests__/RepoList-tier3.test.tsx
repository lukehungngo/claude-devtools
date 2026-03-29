import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RepoList } from "../RepoList";
import type { RepoGroup, SessionInfo } from "../../lib/types";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "session-1",
    projectHash: "hash-1",
    path: "/path/to/session-1.jsonl",
    startTime: "2026-01-01T00:00:00Z",
    lastModified: new Date().toISOString(),
    eventCount: 42,
    subagentCount: 1,
    cwd: "/project/test",
    isActive: true,
    isRunning: false,
    sessionName: "my-session",
    ...overrides,
  };
}

function makeRepoGroup(overrides: Partial<RepoGroup> = {}): RepoGroup {
  return {
    cwd: "/project/test",
    repoName: "test-repo",
    sessions: [
      makeSession(),
      makeSession({
        id: "session-2",
        startTime: "2026-01-01T01:00:00Z",
        lastModified: "2026-01-01T01:00:00Z",
        eventCount: 10,
        subagentCount: 0,
        isRunning: false,
        sessionName: "older-session",
      }),
    ],
    lastActive: new Date().toISOString(),
    hasActiveSessions: true,
    ...overrides,
  };
}

function expandRepo() {
  fireEvent.click(screen.getByText("test-repo"));
}

describe("T3-05: Session Naming/Rename", () => {
  it("renders pencil icon button on session items when expanded", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    const pencilBtns = screen.getAllByLabelText(/rename session/i);
    expect(pencilBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking pencil shows inline input with current session name", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    const pencilBtns = screen.getAllByLabelText(/rename session/i);
    fireEvent.click(pencilBtns[0]);

    const input = screen.getByLabelText("New session name");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("my-session");
  });

  it("pressing Enter saves the new name to localStorage", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    const pencilBtns = screen.getAllByLabelText(/rename session/i);
    fireEvent.click(pencilBtns[0]);

    const input = screen.getByLabelText("New session name");
    fireEvent.change(input, { target: { value: "renamed-session" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const stored = JSON.parse(localStorage.getItem("session-names") || "{}");
    expect(stored["session-1"]).toBe("renamed-session");
  });

  it("pressing Escape cancels rename without saving", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    const pencilBtns = screen.getAllByLabelText(/rename session/i);
    fireEvent.click(pencilBtns[0]);

    const input = screen.getByLabelText("New session name");
    fireEvent.change(input, { target: { value: "cancelled-name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // Input should be gone
    expect(screen.queryByLabelText("New session name")).toBeNull();
    // localStorage should not have the cancelled name
    const stored = JSON.parse(localStorage.getItem("session-names") || "{}");
    expect(stored["session-1"]).toBeUndefined();
  });

  it("displays custom name from localStorage if set", () => {
    localStorage.setItem(
      "session-names",
      JSON.stringify({ "session-1": "custom-name" }),
    );

    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    expect(screen.getByText("custom-name")).toBeDefined();
  });
});

describe("T3-06: Continue Last Session", () => {
  it("renders Continue button on the most recent non-running session", () => {
    const onResumeSession = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onResumeSession={onResumeSession}
      />,
    );
    expandRepo();

    const continueBtn = screen.getByLabelText(/continue session/i);
    expect(continueBtn).toBeDefined();
  });

  it("calls onResumeSession when Continue button is clicked", () => {
    const onResumeSession = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onResumeSession={onResumeSession}
      />,
    );
    expandRepo();

    const continueBtn = screen.getByLabelText(/continue session/i);
    fireEvent.click(continueBtn);

    expect(onResumeSession).toHaveBeenCalledWith("session-1", "/project/test");
  });

  it("does not render Continue button on running sessions", () => {
    const repo = makeRepoGroup({
      sessions: [makeSession({ isRunning: true })],
    });
    const onResumeSession = vi.fn();
    render(
      <RepoList
        repos={[repo]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onResumeSession={onResumeSession}
      />,
    );
    expandRepo();

    expect(screen.queryByLabelText(/continue session/i)).toBeNull();
  });

  it("only shows Continue on the first (most recent) session, not others", () => {
    const onResumeSession = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onResumeSession={onResumeSession}
      />,
    );
    expandRepo();

    const continueBtns = screen.getAllByLabelText(/continue session/i);
    // Only one Continue button for the most recent session
    expect(continueBtns.length).toBe(1);
  });
});

describe("T3-16: Active Session Indicator", () => {
  it("shows pulsing green dot and ACTIVE badge for active session", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={{ projectHash: "hash-1", sessionId: "session-1" }}
        onSelect={vi.fn()}
        activeSessionId="session-1"
      />,
    );
    expandRepo();

    expect(screen.getByText("ACTIVE")).toBeDefined();
    const activeDot = screen.getByTitle("Active session");
    expect(activeDot.className).toContain("animate-pulse");
  });

  it("does not show ACTIVE badge when session is not active", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        activeSessionId="other-id"
      />,
    );
    expandRepo();

    expect(screen.queryByText("ACTIVE")).toBeNull();
  });
});

describe("T3-17: Add Repo Button", () => {
  it("renders + button in the sidebar header", () => {
    const onAddRepo = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onAddRepo={onAddRepo}
      />,
    );

    const addBtn = screen.getByLabelText("Add repository");
    expect(addBtn).toBeDefined();
  });

  it("clicking + button shows inline input for directory path", () => {
    const onAddRepo = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onAddRepo={onAddRepo}
      />,
    );

    fireEvent.click(screen.getByLabelText("Add repository"));

    const input = screen.getByLabelText("Repository path");
    expect(input).toBeDefined();
  });

  it("pressing Enter on input calls onAddRepo with the path", () => {
    const onAddRepo = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onAddRepo={onAddRepo}
      />,
    );

    fireEvent.click(screen.getByLabelText("Add repository"));

    const input = screen.getByLabelText("Repository path");
    fireEvent.change(input, { target: { value: "/new/repo/path" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAddRepo).toHaveBeenCalledWith("/new/repo/path");
  });

  it("pressing Escape dismisses the input", () => {
    const onAddRepo = vi.fn();
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onAddRepo={onAddRepo}
      />,
    );

    fireEvent.click(screen.getByLabelText("Add repository"));
    const input = screen.getByLabelText("Repository path");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByLabelText("Repository path")).toBeNull();
  });
});

describe("T3-18: Empty State CTA", () => {
  it("shows empty state when repos is empty and not loading", () => {
    render(
      <RepoList
        repos={[]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("No sessions found")).toBeDefined();
    expect(
      screen.getByText(
        /Start a Claude Code session from the CLI, or click \+ to begin/,
      ),
    ).toBeDefined();
  });

  it("shows loading state when loading is true (not empty state)", () => {
    render(
      <RepoList
        repos={[]}
        loading={true}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading...")).toBeDefined();
    expect(screen.queryByText("No sessions found")).toBeNull();
  });

  it("empty state CTA button triggers add repo flow", () => {
    const onAddRepo = vi.fn();
    render(
      <RepoList
        repos={[]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
        onAddRepo={onAddRepo}
      />,
    );

    const addBtns = screen.getAllByRole("button", { name: /add repository/i });
    // Click the CTA button (the one with text content "Add Repository")
    const ctaBtn = addBtns.find((btn) => btn.textContent?.includes("Add Repository"));
    expect(ctaBtn).toBeDefined();
    fireEvent.click(ctaBtn!);

    // Should show the add repo input
    const input = screen.getByLabelText("Repository path");
    expect(input).toBeDefined();
  });
});
