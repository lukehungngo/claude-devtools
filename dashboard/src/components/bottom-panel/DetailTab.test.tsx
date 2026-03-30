import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DetailTab } from "./DetailTab";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, UserEvent } from "../../lib/types";

function makeToolUseTurn(): TurnSnapshot {
  const assistantEvent: AssistantEvent = {
    type: "assistant",
    uuid: "a1",
    timestamp: "2026-01-01T10:00:00Z",
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Let me read that file." },
        { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "/src/main.ts" } },
        { type: "tool_use", id: "tu2", name: "Read", input: { file_path: "/src/utils.ts" } },
        { type: "tool_use", id: "tu3", name: "Bash", input: { command: "pnpm test" } },
      ],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };

  const userEvent: UserEvent = {
    type: "user",
    uuid: "u1",
    timestamp: "2026-01-01T10:00:01Z",
    sessionId: "s1",
    userType: "internal",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tu1", content: "file content here" },
        { type: "tool_result", tool_use_id: "tu2", content: "other content", is_error: true },
        { type: "tool_result", tool_use_id: "tu3", content: "tests passed" },
      ],
    },
  };

  return {
    turnNumber: 1,
    promptText: "Fix the bug",
    events: [assistantEvent, userEvent] as SessionEvent[],
    startIndex: 0,
    endIndex: 2,
    agents: [],
    status: "completed",
    durationMs: 5000,
    cost: 0.1,
    costBreakdown: { total: 0.1, tokensIn: 0.06, tokensOut: 0.04 },
    startTime: "2026-01-01T10:00:00Z",
    completedAt: "2026-01-01T10:00:05Z",
    endTime: "2026-01-01T10:00:05Z",
  };
}

describe("DetailTab", () => {
  afterEach(cleanup);

  it("renders empty state with null activeTurnIndex", () => {
    render(<DetailTab turns={[]} activeTurnIndex={null} />);
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("renders empty state with out-of-bounds activeTurnIndex", () => {
    render(<DetailTab turns={[]} activeTurnIndex={5} />);
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("renders tool groups with mock turn containing tool_use events", () => {
    const turn = makeToolUseTurn();
    render(<DetailTab turns={[turn]} activeTurnIndex={0} />);
    // Should show tool group headers
    expect(screen.getByText(/Read/)).toBeDefined();
    expect(screen.getByText(/Bash/)).toBeDefined();
  });

  it("shows correct status icons", () => {
    const turn = makeToolUseTurn();
    const { container } = render(<DetailTab turns={[turn]} activeTurnIndex={0} />);
    // tu1 = success, tu2 = error, tu3 = success
    const successIcons = container.querySelectorAll("[data-status='success']");
    const errorIcons = container.querySelectorAll("[data-status='error']");
    expect(successIcons.length).toBe(2);
    expect(errorIcons.length).toBe(1);
  });

  it("shows tool input summary", () => {
    const turn = makeToolUseTurn();
    render(<DetailTab turns={[turn]} activeTurnIndex={0} />);
    // Should show file paths from Read tool inputs
    expect(screen.getByText(/\/src\/main\.ts/)).toBeDefined();
    expect(screen.getByText(/\/src\/utils\.ts/)).toBeDefined();
    // Should show command from Bash tool input
    expect(screen.getByText(/pnpm test/)).toBeDefined();
  });
});
