import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RepoList } from "./RepoList";
import type { RepoGroup } from "../lib/types";

// Note: file-level afterEach already handles cleanup

afterEach(() => {
  cleanup();
});

function makeRepoGroup(overrides: Partial<RepoGroup> = {}): RepoGroup {
  return {
    cwd: "/project/test",
    repoName: "test-repo",
    sessions: [
      {
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
      },
      {
        id: "session-2",
        projectHash: "hash-1",
        path: "/path/to/session-2.jsonl",
        startTime: "2026-01-01T01:00:00Z",
        lastModified: new Date().toISOString(),
        eventCount: 10,
        subagentCount: 0,
        cwd: "/project/test",
        isActive: true,
        isRunning: true,
        sessionName: "running-session",
      },
    ],
    lastActive: new Date().toISOString(),
    hasActiveSessions: true,
    ...overrides,
  };
}

describe("RepoList", () => {
  describe("sidebar sections", () => {
    it("does not render Connection, Usage, or Repositories section headers", () => {
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
        />,
      );

      expect(screen.queryByText("Connection")).toBeNull();
      expect(screen.queryByText("Usage")).toBeNull();
      expect(screen.queryByText("Repositories")).toBeNull();
    });

    it("shows repo tree directly without connection badge", () => {
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
        />,
      );

      expect(screen.getByText("test-repo")).toBeDefined();
      expect(screen.queryByText("connected")).toBeNull();
      expect(screen.queryByText("disconnected")).toBeNull();
    });

    it("shows Settings footer", () => {
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
        />,
      );

      expect(screen.getByText("Settings")).toBeDefined();
    });
  });

  describe("repository expansion and sessions", () => {
    it("expands repo to show sessions on click", () => {
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText("test-repo"));

      // Sessions should now be visible
      expect(screen.getByText("my-session")).toBeDefined();
    });

    it("calls onSelect when a session is clicked", () => {
      const onSelect = vi.fn();
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={null}
          onSelect={onSelect}
        />,
      );

      fireEvent.click(screen.getByText("test-repo"));
      fireEvent.click(screen.getByText("my-session"));

      expect(onSelect).toHaveBeenCalledWith({
        projectHash: "hash-1",
        sessionId: "session-1",
      });
    });
  });

  describe("resume action", () => {
    it("renders Resume button on non-running sessions when expanded", () => {
      const onResumeSession = vi.fn();
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
          onResumeSession={onResumeSession}
        />,
      );

      fireEvent.click(screen.getByText("test-repo"));

      const resumeBtns = screen.getAllByTitle(/resume/i);
      expect(resumeBtns.length).toBeGreaterThanOrEqual(1);
    });

    it("calls onResumeSession with sessionId and cwd when Resume is clicked", () => {
      const onResumeSession = vi.fn();
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
          onResumeSession={onResumeSession}
        />,
      );

      fireEvent.click(screen.getByText("test-repo"));

      const resumeBtns = screen.getAllByTitle(/resume/i);
      fireEvent.click(resumeBtns[0]);
      expect(onResumeSession).toHaveBeenCalledWith("session-1", "/project/test");
    });
  });

  describe("entrypoint badge (P1-1/P1-2)", () => {
    it("renders 'bg' badge for sdk-cli entrypoint", () => {
      const repo = makeRepoGroup({
        sessions: [
          {
            id: "bg-session",
            projectHash: "h1",
            path: "/p",
            startTime: "2026-01-01T00:00:00Z",
            lastModified: new Date().toISOString(),
            eventCount: 50,
            subagentCount: 0,
            cwd: "/project/test",
            isActive: true,
            isRunning: true,
            entrypoint: "sdk-cli",
          },
        ],
      });
      render(
        <RepoList repos={[repo]} loading={false} selected={null} onSelect={vi.fn()} />,
      );
      fireEvent.click(screen.getByText(/test-repo/));
      const badge = screen.getByTestId("entrypoint-badge");
      expect(badge.textContent).toBe("bg");
      expect(badge.getAttribute("title")).toContain("sdk-cli");
    });

    it("hides badge for default cli entrypoint", () => {
      const repo = makeRepoGroup({
        sessions: [
          {
            id: "cli-session",
            projectHash: "h1",
            path: "/p",
            startTime: "2026-01-01T00:00:00Z",
            lastModified: new Date().toISOString(),
            eventCount: 50,
            subagentCount: 0,
            cwd: "/project/test",
            isActive: true,
            isRunning: false,
            entrypoint: "cli",
          },
        ],
      });
      render(
        <RepoList repos={[repo]} loading={false} selected={null} onSelect={vi.fn()} />,
      );
      fireEvent.click(screen.getByText(/test-repo/));
      expect(screen.queryByTestId("entrypoint-badge")).toBeNull();
    });

    it("renders 'desk' badge for claude-desktop entrypoint", () => {
      const repo = makeRepoGroup({
        sessions: [
          {
            id: "desk-session",
            projectHash: "h1",
            path: "/p",
            startTime: "2026-01-01T00:00:00Z",
            lastModified: new Date().toISOString(),
            eventCount: 5,
            subagentCount: 0,
            cwd: "/project/test",
            isActive: true,
            isRunning: false,
            entrypoint: "claude-desktop",
          },
        ],
      });
      render(
        <RepoList repos={[repo]} loading={false} selected={null} onSelect={vi.fn()} />,
      );
      fireEvent.click(screen.getByText(/test-repo/));
      expect(screen.getByTestId("entrypoint-badge").textContent).toBe("desk");
    });
  });
});

describe("RepoList REPOS header", () => {
  afterEach(() => { cleanup(); });

  it("renders REPOS header text", () => {
    render(
      <RepoList repos={[]} loading={false} selected={null} onSelect={() => {}} />
    );
    expect(screen.getByText("REPOS")).toBeDefined();
  });

  it("calls onToggleTurnHistory when toggle button clicked", () => {
    const onToggle = vi.fn();
    render(
      <RepoList
        repos={[]}
        loading={false}
        selected={null}
        onSelect={() => {}}
        onToggleTurnHistory={onToggle}
      />
    );
    const toggleBtn = screen.getByTitle("Toggle turn history panel");
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not show toggle button when onToggleTurnHistory not provided", () => {
    render(
      <RepoList repos={[]} loading={false} selected={null} onSelect={() => {}} />
    );
    expect(screen.queryByTitle("Toggle turn history panel")).toBeNull();
  });
});
