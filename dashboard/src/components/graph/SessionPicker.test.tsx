import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionPicker } from "./SessionPicker";
import type { RepoGroup, SessionInfo } from "../../lib/types";

afterEach(cleanup);

const session = (over: Partial<SessionInfo>): SessionInfo => ({
  id: "sess-123456789",
  projectHash: "hashA",
  path: "/p",
  startTime: new Date(Date.now() - 60_000).toISOString(),
  lastModified: new Date().toISOString(),
  eventCount: 10,
  subagentCount: 0,
  ...over,
});

const repo = (over: Partial<RepoGroup>): RepoGroup => ({
  cwd: "/repo",
  repoName: "my-repo",
  sessions: [],
  lastActive: new Date().toISOString(),
  hasActiveSessions: false,
  ...over,
});

const twoRepos = () => [
  repo({
    repoName: "alpha",
    sessions: [session({ id: "aaaaaaaa-1111", projectHash: "hA" }), session({ id: "bbbbbbbb-2222", projectHash: "hA" })],
  }),
  repo({ cwd: "/repo2", repoName: "beta", sessions: [session({ id: "cccccccc-3333", projectHash: "hB" })] }),
];

describe("SessionPicker (two-step repo → session)", () => {
  it("defaults the repo trigger to the first repo and shows the session placeholder when no value", () => {
    render(<SessionPicker repos={[repo({ repoName: "alpha", sessions: [session({})] })]} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("repo-picker-trigger").textContent).toContain("alpha");
    expect(screen.getByText("Select a session…")).toBeTruthy();
    expect(screen.queryByTestId("session-picker-list")).toBeNull();
  });

  it("opens the repo list and shows each repo with its session count", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("repo-picker-trigger"));
    expect(screen.getByTestId("repo-picker-option-/repo").textContent).toContain("alpha");
    expect(screen.getByTestId("repo-picker-option-/repo2").textContent).toContain("beta");
    // alpha has 2 sessions
    expect(screen.getByTestId("repo-picker-option-/repo").textContent).toContain("2");
  });

  it("selecting a repo auto-selects its most-recent (active-first) session", () => {
    const onChange = vi.fn();
    const repos = [
      repo({ repoName: "alpha", sessions: [session({ id: "aaaaaaaa-1111", projectHash: "hA" })] }),
      repo({
        cwd: "/repo2",
        repoName: "beta",
        hasActiveSessions: true,
        sessions: [
          session({ id: "old-1", projectHash: "hB", startTime: new Date(Date.now() - 100_000).toISOString() }),
          session({ id: "live-1", projectHash: "hB", isActive: true, startTime: new Date(Date.now() - 5_000).toISOString() }),
        ],
      }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("repo-picker-trigger"));
    fireEvent.click(screen.getByTestId("repo-picker-option-/repo2"));
    // beta's active session wins
    expect(onChange).toHaveBeenCalledWith({ projectHash: "hB", sessionId: "live-1" });
  });

  it("opens the session list for the current repo and renders its sessions", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    expect(screen.getByTestId("session-picker-option-hA::aaaaaaaa-1111")).toBeTruthy();
    expect(screen.getByTestId("session-picker-option-hA::bbbbbbbb-2222")).toBeTruthy();
    // beta's session is NOT shown (different repo)
    expect(screen.queryByTestId("session-picker-option-hB::cccccccc-3333")).toBeNull();
  });

  it("calls onChange with {projectHash, sessionId} and closes when a session is clicked", () => {
    const onChange = vi.fn();
    render(<SessionPicker repos={twoRepos()} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    fireEvent.click(screen.getByTestId("session-picker-option-hA::bbbbbbbb-2222"));
    expect(onChange).toHaveBeenCalledWith({ projectHash: "hA", sessionId: "bbbbbbbb-2222" });
    expect(screen.queryByTestId("session-picker-list")).toBeNull();
  });

  it("shows the repo name and the short session id in the closed triggers for a value", () => {
    const repos = [
      repo({ repoName: "claude-devtools", sessions: [session({ id: "sel-9999-abcdef", projectHash: "hA" })] }),
    ];
    render(<SessionPicker repos={repos} value={{ projectHash: "hA", sessionId: "sel-9999-abcdef" }} onChange={vi.fn()} />);
    expect(screen.getByTestId("repo-picker-trigger").textContent).toContain("claude-devtools");
    expect(screen.getByTestId("session-picker-trigger").textContent).toContain("sel-9999");
    expect(screen.getByTestId("session-picker-trigger").getAttribute("aria-expanded")).toBe("false");
  });

  it("marks an active session with a live indicator in the option", () => {
    const repos = [
      repo({ repoName: "alpha", hasActiveSessions: true, sessions: [session({ id: "live-0001", projectHash: "hA", isActive: true })] }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    expect(screen.getByTestId("session-picker-option-hA::live-0001").textContent).toContain("live");
  });

  it("shows subagent count in a session option when present", () => {
    const repos = [
      repo({ repoName: "alpha", sessions: [session({ id: "withsubs-1", projectHash: "hA", subagentCount: 7 })] }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    expect(screen.getByTestId("session-picker-option-hA::withsubs-1").textContent).toContain("7 ag");
  });

  it("filters sessions by typed id query", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    fireEvent.change(screen.getByTestId("session-picker-search"), { target: { value: "bbbb" } });
    expect(screen.getByTestId("session-picker-option-hA::bbbbbbbb-2222")).toBeTruthy();
    expect(screen.queryByTestId("session-picker-option-hA::aaaaaaaa-1111")).toBeNull();
  });

  it("shows a no-matches state when the session filter matches nothing", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    fireEvent.change(screen.getByTestId("session-picker-search"), { target: { value: "zzzzzz" } });
    expect(screen.getByTestId("session-picker-empty").textContent).toMatch(/no match/i);
  });

  it("supports arrow-key navigation + Enter to select the highlighted session", () => {
    const onChange = vi.fn();
    render(<SessionPicker repos={twoRepos()} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    const search = screen.getByTestId("session-picker-search");
    fireEvent.keyDown(search, { key: "ArrowDown" }); // 0 (aaaa) → 1 (bbbb)
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ projectHash: "hA", sessionId: "bbbbbbbb-2222" });
    expect(screen.queryByTestId("session-picker-list")).toBeNull();
  });

  it("sets aria-activedescendant to the highlighted session option", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    const search = screen.getByTestId("session-picker-search");
    expect(search.getAttribute("aria-activedescendant")).toBe("dt-opt-session-picker-hA::aaaaaaaa-1111");
    fireEvent.keyDown(search, { key: "End" });
    expect(search.getAttribute("aria-activedescendant")).toBe("dt-opt-session-picker-hA::bbbbbbbb-2222");
  });

  it("marks the selected session option as aria-selected when open", () => {
    const repos = [repo({ repoName: "alpha", sessions: [session({ id: "sel-9999", projectHash: "hA" })] })];
    render(<SessionPicker repos={repos} value={{ projectHash: "hA", sessionId: "sel-9999" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    expect(screen.getByTestId("session-picker-option-hA::sel-9999").getAttribute("aria-selected")).toBe("true");
  });

  it("closes the session list on Escape", () => {
    render(<SessionPicker repos={twoRepos()} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("session-picker-trigger"));
    expect(screen.getByTestId("session-picker-list")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("session-picker-search"), { key: "Escape" });
    expect(screen.queryByTestId("session-picker-list")).toBeNull();
  });

  it("disables the session control when the current repo has no sessions", () => {
    render(<SessionPicker repos={[repo({ repoName: "empty", sessions: [] })]} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("session-picker-trigger").hasAttribute("disabled")).toBe(true);
  });
});
