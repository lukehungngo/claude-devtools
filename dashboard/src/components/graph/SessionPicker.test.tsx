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

describe("SessionPicker", () => {
  it("groups sessions by repo name and renders all session options", () => {
    const repos = [
      repo({
        repoName: "alpha",
        sessions: [
          session({ id: "aaaaaaaa-1111", projectHash: "hA" }),
          session({ id: "bbbbbbbb-2222", projectHash: "hA" }),
        ],
      }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={vi.fn()} />);

    const optgroup = screen.getByRole("group", { name: "alpha" }) as HTMLOptGroupElement;
    expect(optgroup).toBeTruthy();
    const options = optgroup.querySelectorAll("option");
    expect(options.length).toBe(2);
  });

  it("calls onChange with {projectHash, sessionId} when an option is selected", () => {
    const onChange = vi.fn();
    const repos = [
      repo({
        repoName: "alpha",
        sessions: [
          session({ id: "aaaaaaaa-1111", projectHash: "hA" }),
          session({ id: "bbbbbbbb-2222", projectHash: "hA" }),
        ],
      }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={onChange} />);

    const select = screen.getByTestId("session-picker-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hA::bbbbbbbb-2222" } });
    expect(onChange).toHaveBeenCalledWith({ projectHash: "hA", sessionId: "bbbbbbbb-2222" });
  });

  it("marks an active session with a live indicator in its option label", () => {
    const repos = [
      repo({
        repoName: "alpha",
        hasActiveSessions: true,
        sessions: [session({ id: "live-0001", projectHash: "hA", isActive: true })],
      }),
    ];
    render(<SessionPicker repos={repos} value={null} onChange={vi.fn()} />);
    const option = screen.getByTestId("session-option-hA::live-0001");
    expect(option.textContent).toContain("live");
  });

  it("reflects the selected value in the select element", () => {
    const repos = [
      repo({
        repoName: "alpha",
        sessions: [session({ id: "sel-9999", projectHash: "hA" })],
      }),
    ];
    render(
      <SessionPicker
        repos={repos}
        value={{ projectHash: "hA", sessionId: "sel-9999" }}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByTestId("session-picker-select") as HTMLSelectElement;
    expect(select.value).toBe("hA::sel-9999");
  });
});
