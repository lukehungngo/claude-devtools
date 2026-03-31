import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AgentCard } from "./AgentCard";
import { ToolEntries } from "./ToolEntries";
import type { AssistantEvent, UserEvent, SessionEvent } from "../../lib/types";

afterEach(cleanup);

describe("AgentCard", () => {
  it("renders agent card with name and description", () => {
    const { getByText, getByLabelText } = render(
      <AgentCard
        agentName="engineer"
        description="Implement validation logic for the form"
        status="success"
      />,
    );

    expect(getByText("engineer")).toBeTruthy();
    expect(getByText(/Implement validation/)).toBeTruthy();
    expect(getByLabelText("engineer subagent")).toBeTruthy();
  });

  it("shows stats line with tool count, duration, cost", () => {
    const { getByText } = render(
      <AgentCard
        agentName="researcher"
        description="Analyze codebase patterns"
        status="success"
        toolCount={12}
        durationMs={134000}
        cost={0.42}
      />,
    );

    expect(getByText(/12 tools/)).toBeTruthy();
    expect(getByText(/2m 14s/)).toBeTruthy();
    expect(getByText(/\$0\.420/)).toBeTruthy();
  });

  it("shows running status with amber indicator", () => {
    const { container, getByLabelText } = render(
      <AgentCard
        agentName="bugfixer"
        description="Fix the broken test"
        status="running"
      />,
    );

    const indicator = getByLabelText("Running");
    expect(indicator).toBeTruthy();
    // The running dot should have amber color
    expect(indicator.style.background).toBe("var(--amb)");
  });

  it("shows success status with green check", () => {
    const { getByLabelText } = render(
      <AgentCard
        agentName="reviewer"
        description="Review the pull request"
        status="success"
      />,
    );

    const indicator = getByLabelText("Success");
    expect(indicator).toBeTruthy();
  });

  it("shows error status with red indicator", () => {
    const { getByLabelText } = render(
      <AgentCard
        agentName="engineer"
        description="Failed task"
        status="error"
      />,
    );

    const indicator = getByLabelText("Error");
    expect(indicator).toBeTruthy();
  });

  it("truncates long descriptions to 60 characters", () => {
    const longDesc = "A".repeat(80);
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description={longDesc}
        status="success"
      />,
    );

    const text = container.textContent || "";
    // Should contain truncated version, not the full 80-char string
    expect(text).not.toContain(longDesc);
    expect(text).toContain("A".repeat(60));
  });

  it("does not show stats line when no optional props provided", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    // Stats line should not be present
    const statsLine = container.querySelector("[data-testid='agent-card-stats']");
    expect(statsLine).toBeNull();
  });
});

// --- Integration: AgentCard rendered inside ToolEntries for agent dispatch ---

function makeAssistantEvent(toolUse: {
  id: string;
  name: string;
  input: Record<string, unknown>;
}): AssistantEvent {
  return {
    type: "assistant",
    uuid: "uuid-asst-agent",
    sessionId: "sess-1",
    timestamp: "2026-01-01T00:00:00Z",
    message: {
      id: "msg-1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-20250514",
      content: [
        { type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  };
}

function makeUserEvent(toolUseId: string, resultContent: string): UserEvent {
  return {
    type: "user",
    uuid: "uuid-user-agent",
    sessionId: "sess-1",
    timestamp: "2026-01-01T00:00:01Z",
    userType: "external",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: toolUseId, content: resultContent },
      ],
    },
  };
}

describe("AgentCard integration in ToolEntries", () => {
  afterEach(cleanup);

  it("renders AgentCard for Task tool_use instead of normal tool row", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-task-1",
        name: "Task",
        input: { description: "Implement validation logic", prompt: "Please implement the validation" },
      }),
      makeUserEvent("tu-task-1", "Task completed successfully"),
    ];
    const { container } = render(<ToolEntries events={events} />);

    // Should render an agent card (aria-label contains "subagent")
    const agentCard = container.querySelector("[aria-label*='subagent']");
    expect(agentCard).not.toBeNull();
  });

  it("renders AgentCard for dispatch_agent tool_use", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-dispatch-1",
        name: "dispatch_agent",
        input: { description: "Review the code", subagent_type: "reviewer" },
      }),
      makeUserEvent("tu-dispatch-1", "Agent completed"),
    ];
    const { container } = render(<ToolEntries events={events} />);

    const agentCard = container.querySelector("[aria-label*='subagent']");
    expect(agentCard).not.toBeNull();
    expect(agentCard?.textContent).toContain("reviewer");
  });
});
