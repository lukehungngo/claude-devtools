import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { RepoGroup, SessionInfo } from "../../lib/types";
import { HistoryTab } from "./HistoryTab";

// Mock tanstack router
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "sess-abc123",
    projectHash: "proj-hash-1",
    path: "/path/to/session.jsonl",
    startTime: "2026-03-30T10:00:00Z",
    lastModified: "2026-03-30T14:30:00Z",
    eventCount: 42,
    subagentCount: 2,
    sessionName: "Fix the login bug",
    ...overrides,
  };
}

const mockRepos: RepoGroup[] = [
  {
    cwd: "/home/user/project-a",
    repoName: "project-a",
    sessions: [
      makeSession({ id: "sess-1", lastModified: "2026-03-30T14:30:00Z", sessionName: "Fix login" }),
      makeSession({ id: "sess-2", lastModified: "2026-03-29T10:00:00Z", sessionName: "Add tests" }),
    ],
    lastActive: "2026-03-30T14:30:00Z",
    hasActiveSessions: false,
  },
  {
    cwd: "/home/user/project-b",
    repoName: "project-b",
    sessions: [
      makeSession({
        id: "sess-3",
        projectHash: "proj-hash-2",
        lastModified: "2026-03-30T16:00:00Z",
        sessionName: "Deploy pipeline",
      }),
    ],
    lastActive: "2026-03-30T16:00:00Z",
    hasActiveSessions: true,
  },
];

describe("HistoryTab", () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockClear();
  });

  it("renders empty state with no repos", () => {
    render(<HistoryTab repos={[]} />);
    expect(screen.getByText("No session history")).toBeDefined();
  });

  it("renders empty state with repos that have no sessions", () => {
    const emptyRepos: RepoGroup[] = [
      { cwd: "/home/user/proj", repoName: "proj", sessions: [], lastActive: "", hasActiveSessions: false },
    ];
    render(<HistoryTab repos={emptyRepos} />);
    expect(screen.getByText("No session history")).toBeDefined();
  });

  it("renders session list sorted by lastModified descending", () => {
    render(<HistoryTab repos={mockRepos} />);
    const rows = screen.getAllByTestId("history-session-row");
    expect(rows.length).toBe(3);
    // First row should be sess-3 (most recent: Mar 30 16:00)
    expect(rows[0].textContent).toContain("sess-3".slice(0, 8));
    // Second row: sess-1 (Mar 30 14:30)
    expect(rows[1].textContent).toContain("sess-1".slice(0, 8));
    // Third row: sess-2 (Mar 29 10:00)
    expect(rows[2].textContent).toContain("sess-2".slice(0, 8));
  });

  it("current session is highlighted", () => {
    render(<HistoryTab repos={mockRepos} currentSessionId="sess-1" />);
    const rows = screen.getAllByTestId("history-session-row");
    // sess-1 is the second row (sorted by date)
    const currentRow = rows.find((r) => r.textContent?.includes("sess-1"));
    expect(currentRow).toBeDefined();
    expect(currentRow!.style.borderLeft).toContain("2px solid var(--acc)");
    expect(currentRow!.style.background).toBe("var(--bg-s)");
  });

  it("clicking a session navigates to the session route", () => {
    render(<HistoryTab repos={mockRepos} />);
    const rows = screen.getAllByTestId("history-session-row");
    fireEvent.click(rows[0]); // sess-3 with projectHash "proj-hash-2"
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/session/$repoSlug/$sessionId",
      params: { repoSlug: "proj-hash-2", sessionId: "sess-3" },
    });
  });

  it("shows truncated session name", () => {
    render(<HistoryTab repos={mockRepos} />);
    expect(screen.getByText("Deploy pipeline")).toBeDefined();
    expect(screen.getByText("Fix login")).toBeDefined();
  });
});
