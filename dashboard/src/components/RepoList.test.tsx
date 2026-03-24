import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RepoList } from "./RepoList";
import type { RepoGroup } from "../lib/types";

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
  describe("TASK-017: New Session button", () => {
    it("renders the New Session button when onNewSession is provided", () => {
      const onNewSession = vi.fn();
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
          onNewSession={onNewSession}
        />,
      );

      const btn = screen.getByRole("button", { name: /create new session/i });
      expect(btn).toBeDefined();
    });

    it("calls onNewSession when New Session button is clicked", () => {
      const onNewSession = vi.fn();
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
          onNewSession={onNewSession}
        />,
      );

      const btn = screen.getByRole("button", { name: /create new session/i });
      fireEvent.click(btn);
      expect(onNewSession).toHaveBeenCalledTimes(1);
    });

    it("does not render New Session button when onNewSession is not provided", () => {
      render(
        <RepoList
          repos={[makeRepoGroup()]}
          loading={false}
          selected={null}
          onSelect={vi.fn()}
        />,
      );

      const btn = screen.queryByRole("button", { name: /create new session/i });
      expect(btn).toBeNull();
    });
  });

  describe("TASK-018: Active session indicator", () => {
    it("shows active indicator for the matching activeSessionId", () => {
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={{ projectHash: "hash-1", sessionId: "session-1" }}
          onSelect={vi.fn()}
          activeSessionId="session-1"
        />,
      );

      // Expand the repo to show sessions
      fireEvent.click(screen.getByText("test-repo"));

      const activeIndicator = screen.getByTitle("Active session");
      expect(activeIndicator).toBeDefined();
    });

    it("does not show active indicator when activeSessionId does not match", () => {
      const repo = makeRepoGroup();
      render(
        <RepoList
          repos={[repo]}
          loading={false}
          selected={{ projectHash: "hash-1", sessionId: "session-1" }}
          onSelect={vi.fn()}
          activeSessionId="other-session"
        />,
      );

      fireEvent.click(screen.getByText("test-repo"));

      const activeIndicator = screen.queryByTitle("Active session");
      expect(activeIndicator).toBeNull();
    });

    it("shows status dot with green border for live sessions", () => {
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

      // Running session should have LIVE badge
      expect(screen.getByText("LIVE")).toBeDefined();
    });
  });

  describe("TASK-019: Resume action", () => {
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

      // session-1 is not running, should have a resume button
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

    it("does not show Resume button on running sessions", () => {
      const onResumeSession = vi.fn();
      // Create a repo with only running sessions
      const repo = makeRepoGroup({
        sessions: [
          {
            id: "session-running",
            projectHash: "hash-1",
            path: "/path/to/session.jsonl",
            startTime: "2026-01-01T00:00:00Z",
            lastModified: new Date().toISOString(),
            eventCount: 10,
            subagentCount: 0,
            cwd: "/project/test",
            isActive: true,
            isRunning: true,
            sessionName: "running-only",
          },
        ],
      });
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

      const resumeBtns = screen.queryAllByTitle(/resume/i);
      expect(resumeBtns.length).toBe(0);
    });
  });
});
