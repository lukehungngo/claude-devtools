import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("v4 Sidebar: Session Display", () => {
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

  it("shows session name when no custom name in localStorage", () => {
    render(
      <RepoList
        repos={[makeRepoGroup()]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expandRepo();

    expect(screen.getByText("my-session")).toBeDefined();
  });
});

describe("v4 Sidebar: Resume Action", () => {
  it("renders Resume button on non-running sessions when expanded", () => {
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

    const resumeBtns = screen.getAllByTitle(/resume/i);
    expect(resumeBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("does not render Resume button on running sessions", () => {
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

    const resumeBtns = screen.queryAllByTitle(/resume/i);
    expect(resumeBtns.length).toBe(0);
  });
});

describe("v4 Sidebar: Empty & Loading States", () => {
  it("shows empty state when repos is empty", () => {
    render(
      <RepoList
        repos={[]}
        loading={false}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("No sessions found")).toBeDefined();
  });

  it("shows loading state", () => {
    render(
      <RepoList
        repos={[]}
        loading={true}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading...")).toBeDefined();
  });
});
