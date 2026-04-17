import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DetailTab } from "./DetailTab";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, UserEvent } from "../../lib/types";

function makeToolUseTurnData(): { turn: TurnSnapshot; allEvents: SessionEvent[] } {
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

  const allEvents = [assistantEvent, userEvent] as SessionEvent[];

  const turn: TurnSnapshot = {
    turnNumber: 1,
    promptText: "Fix the bug",
    startIndex: 0,
    endIndex: 2,
    agents: [],
    durationMs: 5000,
    cost: 0.1,
    costBreakdown: { total: 0.1, inputCost: 0.06, outputCost: 0.04 },
    inputTokens: 0,
    outputTokens: 0,
    startTime: "2026-01-01T10:00:00Z",
    endTime: "2026-01-01T10:00:05Z",
    dispatchedAgentIds: new Set<string>(["main"]),
  };

  return { turn, allEvents };
}

describe("DetailTab", () => {
  afterEach(cleanup);

  it("renders empty state with null activeTurnIndex", () => {
    render(<DetailTab turns={[]} allEvents={[]} activeTurnIndex={null} />);
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("renders empty state with out-of-bounds activeTurnIndex", () => {
    render(<DetailTab turns={[]} allEvents={[]} activeTurnIndex={5} />);
    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
  });

  it("renders tool groups with mock turn containing tool_use events", () => {
    const { turn, allEvents } = makeToolUseTurnData();
    render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);
    // Should show tool group headers (use getAllByText since header also mentions tools)
    expect(screen.getAllByText(/Read/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bash/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows correct status icons", () => {
    const { turn, allEvents } = makeToolUseTurnData();
    const { container } = render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);
    // tu1 = success, tu2 = error, tu3 = success
    const successIcons = container.querySelectorAll("[data-status='success']");
    const errorIcons = container.querySelectorAll("[data-status='error']");
    expect(successIcons.length).toBe(2);
    expect(errorIcons.length).toBe(1);
  });

  it("shows tool input summary", () => {
    const { turn, allEvents } = makeToolUseTurnData();
    render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);
    // Should show file paths from Read tool inputs
    expect(screen.getByText(/\/src\/main\.ts/)).toBeDefined();
    expect(screen.getByText(/\/src\/utils\.ts/)).toBeDefined();
    // Should show command from Bash tool input
    expect(screen.getByText(/pnpm test/)).toBeDefined();
  });

  // ── Header bar tests (TASK-007) ──

  it("renders header with agent icon and turn number", () => {
    const { allEvents } = makeToolUseTurnData();
    const turn: TurnSnapshot = {
      turnNumber: 5,
      promptText: "Fix the bug",
      startIndex: 0,
      endIndex: allEvents.length,
      agents: [
        {
          agentId: "s1",
          agentType: "engineer",
          displayName: "Engineer S1",
          invocationCount: 3,
          cost: 0.42,
          tokensIn: 5000,
          tokensOut: 2000,
          tools: ["Read", "Write"],
        },
      ],
      durationMs: 134000,
      cost: 0.42,
      costBreakdown: { total: 0.42, inputCost: 0.15, outputCost: 0.27 },
      inputTokens: 0,
      outputTokens: 0,
      startTime: "2026-03-30T10:00:00Z",
      endTime: "2026-03-30T10:02:14Z",
      dispatchedAgentIds: new Set<string>(["main", "s1"]),
    };
    render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);

    // Agent badge: engineer -> EN (via getSpanIcon)
    expect(screen.getByTestId("detail-header-badge").textContent).toContain("EN");
    // Turn number
    expect(screen.getByTestId("detail-header-turn").textContent).toContain("T5");
  });

  it("renders duration and cost in header", () => {
    const { allEvents } = makeToolUseTurnData();
    const turn: TurnSnapshot = {
      turnNumber: 3,
      promptText: "test",
      startIndex: 0,
      endIndex: allEvents.length,
      agents: [
        {
          agentId: "main",
          agentType: "main",
          displayName: "Main",
          invocationCount: 1,
          cost: 0.42,
          tokensIn: 5000,
          tokensOut: 2000,
          tools: [],
        },
      ],
      durationMs: 134000,
      cost: 0.42,
      costBreakdown: { total: 0.42, inputCost: 0.15, outputCost: 0.27 },
      inputTokens: 0,
      outputTokens: 0,
      startTime: "2026-03-30T10:00:00Z",
      endTime: "2026-03-30T10:02:14Z",
      dispatchedAgentIds: new Set<string>(["main"]),
    };
    render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);

    // 134000ms = 2m 14s
    expect(screen.getByTestId("detail-header-duration").textContent).toContain("2m 14s");
    // $0.42 -> $0.420
    expect(screen.getByTestId("detail-header-cost").textContent).toContain("$0.420");
  });

  it("shows primary tool name and count", () => {
    const { allEvents } = makeToolUseTurnData();
    // The makeToolUseTurnData has Read x2, Bash x1 -> primary = Read x2
    const turn: TurnSnapshot = {
      turnNumber: 1,
      promptText: "test",
      startIndex: 0,
      endIndex: allEvents.length,
      agents: [
        {
          agentId: "main",
          agentType: "main",
          displayName: "Main",
          invocationCount: 1,
          cost: 0.1,
          tokensIn: 100,
          tokensOut: 50,
          tools: ["Read", "Bash"],
        },
      ],
      durationMs: 5000,
      cost: 0.1,
      costBreakdown: { total: 0.1, inputCost: 0.06, outputCost: 0.04 },
      inputTokens: 0,
      outputTokens: 0,
      startTime: "2026-01-01T10:00:00Z",
      endTime: "2026-01-01T10:00:05Z",
      dispatchedAgentIds: new Set<string>(["main"]),
    };
    render(<DetailTab turns={[turn]} allEvents={allEvents} activeTurnIndex={0} />);

    // Read x2 is the most common tool
    expect(screen.getByTestId("detail-header-tool").textContent).toContain("Read x2");
  });

  it("renders empty state when no active turn (header absent)", () => {
    render(<DetailTab turns={[]} allEvents={[]} activeTurnIndex={null} />);

    expect(screen.getByText("Select a turn to see tool details")).toBeDefined();
    expect(screen.queryByTestId("detail-header")).toBeNull();
  });
});
