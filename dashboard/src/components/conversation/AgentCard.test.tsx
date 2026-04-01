import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
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

  it("renders AGENT label badge with purple theme", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const badge = container.querySelector("[data-testid='agent-label-badge']");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("AGENT");
    // Purple theme applied via Tailwind arbitrary value classes
    expect(badge!.className).toContain("bg-[var(--pur-bg)]");
    expect(badge!.className).toContain("text-[var(--pur)]");
  });

  it("has PhaseGroup-style outer container with left margin", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const card = container.firstElementChild as HTMLElement;
    // All static styles now via Tailwind classes
    expect(card.className).toContain("border");
    expect(card.className).toContain("border-[var(--bd)]");
    expect(card.className).toContain("rounded-dt");
    expect(card.className).toContain("overflow-hidden");
    expect(card.className).toContain("ml-4");
    expect(card.className).toContain("mb-[2px]");
  });

  it("has PhaseGroup-style header with bg2 background", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const header = container.querySelector("[data-testid='agent-card-header']") as HTMLElement;
    // Static styles now via Tailwind classes
    expect(header.className).toContain("bg-[var(--bg2)]");
    expect(header.className).toContain("hover:bg-[var(--bg3)]");
  });

  it("always shows chevron regardless of children", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).not.toBeNull();
  });

  it("shows duration inline in header when provided", () => {
    const { container } = render(
      <AgentCard
        agentName="researcher"
        description="Analyze codebase patterns"
        status="success"
        durationMs={134000}
      />,
    );

    // Duration should be in the header, not a separate stats line
    const header = container.querySelector("[data-testid='agent-card-header']");
    expect(header!.textContent).toContain("2m 14s");

    // No separate stats line should exist
    const statsLine = container.querySelector("[data-testid='agent-card-stats']");
    expect(statsLine).toBeNull();
  });

  it("renders toolStats as pill badges with getToolBadgeColors styling", () => {
    const { container } = render(
      <AgentCard
        agentName="researcher"
        description="Analyze codebase patterns"
        status="success"
        toolStats={[
          { name: "Read", count: 11 },
          { name: "Grep", count: 6 },
        ]}
      />,
    );

    const badges = container.querySelectorAll("[data-testid='agent-stat-badge']");
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toBe("Read 11");
    expect(badges[1].textContent).toBe("Grep 6");
  });

  it("renders cost badge with formatted value", () => {
    const { container } = render(
      <AgentCard
        agentName="researcher"
        description="Analyze codebase patterns"
        status="success"
        cost={6.67}
      />,
    );

    const costBadge = container.querySelector("[data-testid='agent-cost']");
    expect(costBadge).not.toBeNull();
    expect(costBadge!.textContent).toContain("$6.67");
  });

  it("shows running status with amber indicator", () => {
    const { getByLabelText } = render(
      <AgentCard
        agentName="bugfixer"
        description="Fix the broken test"
        status="running"
      />,
    );

    const indicator = getByLabelText("Running");
    expect(indicator).toBeTruthy();
    expect(indicator.classList.contains("running-dot")).toBe(true);
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

  it("does not show duration or cost when not provided", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const costBadge = container.querySelector("[data-testid='agent-cost']");
    expect(costBadge).toBeNull();
    const durationBadge = container.querySelector("[data-testid='agent-duration']");
    expect(durationBadge).toBeNull();
  });

  it("applies pulse-opacity class to description when running", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Working on it"
        status="running"
      />,
    );

    const description = container.querySelector("[data-testid='agent-description']");
    expect(description).not.toBeNull();
    expect(description!.classList.contains("pulse-opacity")).toBe(true);
  });

  it("uses Tailwind classes instead of static inline styles", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
        cost={1.5}
        durationMs={5000}
        toolStats={[{ name: "Read", count: 3 }]}
      >
        <div>Child</div>
      </AgentCard>,
    );

    // The outer container should use Tailwind classes, not inline border/overflow/margin
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.border).toBe("");
    expect(card.style.overflow).toBe("");
    expect(card.style.marginLeft).toBe("");
    expect(card.classList.contains("overflow-hidden")).toBe(true);
    expect(card.classList.contains("ml-4")).toBe(true);

    // The header should use Tailwind classes, not inline padding/background/gap
    const header = container.querySelector("[data-testid='agent-card-header']") as HTMLElement;
    expect(header.style.padding).toBe("");
    expect(header.style.background).toBe("");
    expect(header.style.gap).toBe("");

    // The AGENT badge should use Tailwind classes, not inline fontSize/fontWeight/etc
    const badge = container.querySelector("[data-testid='agent-label-badge']") as HTMLElement;
    expect(badge.style.fontSize).toBe("");
    expect(badge.style.fontWeight).toBe("");
    expect(badge.style.background).toBe("");
    expect(badge.classList.contains("uppercase")).toBe(true);

    // Cost and duration should use font-mono class, not fontFamily style
    const costEl = container.querySelector("[data-testid='agent-cost']") as HTMLElement;
    expect(costEl.style.fontFamily).toBe("");
    expect(costEl.classList.contains("font-mono")).toBe(true);

    const durationEl = container.querySelector("[data-testid='agent-duration']") as HTMLElement;
    expect(durationEl.style.fontFamily).toBe("");
    expect(durationEl.classList.contains("font-mono")).toBe(true);

    // Stat badges should use font-mono class, not fontFamily style
    const statBadge = container.querySelector("[data-testid='agent-stat-badge']") as HTMLElement;
    expect(statBadge.style.fontFamily).toBe("");
    expect(statBadge.classList.contains("font-mono")).toBe(true);
  });

  it("uses Tailwind hover class instead of imperative mouse handlers", () => {
    const { container } = render(
      <AgentCard
        agentName="engineer"
        description="Some task"
        status="success"
      />,
    );

    const header = container.querySelector("[data-testid='agent-card-header']") as HTMLElement;
    // Should not change background on hover via JS — Tailwind hover: handles it
    const bgBefore = header.style.background;
    fireEvent.mouseEnter(header);
    const bgAfter = header.style.background;
    expect(bgBefore).toBe(bgAfter);
  });
});

describe("AgentCard expand/collapse", () => {
  afterEach(cleanup);

  it("shows chevron even when no children provided", () => {
    const { container } = render(
      <AgentCard agentName="engineer" description="Some task" status="success" />,
    );
    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).not.toBeNull();
  });

  it("expands children and rotates chevron on click", () => {
    const { container, getByText, queryByText } = render(
      <AgentCard agentName="engineer" description="Some task" status="success">
        <div>Nested tool content</div>
      </AgentCard>,
    );

    // Children should not be visible initially
    expect(queryByText("Nested tool content")).toBeNull();

    // Click the header to expand
    const header = container.querySelector("[data-testid='agent-card-header']")!;
    fireEvent.click(header);

    // Children should now be visible
    expect(getByText("Nested tool content")).toBeTruthy();

    // Chevron should be rotated
    const chevronWrap = container.querySelector("[data-testid='agent-card-chevron']") as HTMLElement;
    expect(chevronWrap.style.transform).toBe("rotate(90deg)");
  });

  it("collapses children on second click", () => {
    const { container, queryByText } = render(
      <AgentCard agentName="engineer" description="Some task" status="success">
        <div>Nested tool content</div>
      </AgentCard>,
    );

    const header = container.querySelector("[data-testid='agent-card-header']")!;

    // Expand
    fireEvent.click(header);
    expect(queryByText("Nested tool content")).not.toBeNull();

    // Collapse
    fireEvent.click(header);
    expect(queryByText("Nested tool content")).toBeNull();

    // Chevron should be back to default rotation
    const chevronWrap = container.querySelector("[data-testid='agent-card-chevron']") as HTMLElement;
    expect(chevronWrap.style.transform).toBe("rotate(0deg)");
  });

  it("toggles aria-expanded attribute", () => {
    const { container } = render(
      <AgentCard agentName="engineer" description="Some task" status="success">
        <div>Child</div>
      </AgentCard>,
    );

    const card = container.querySelector("[aria-label='engineer subagent']")!;
    expect(card.getAttribute("aria-expanded")).toBe("false");

    const header = container.querySelector("[data-testid='agent-card-header']")!;
    fireEvent.click(header);
    expect(card.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows expanded body with border-top separator", () => {
    const { container } = render(
      <AgentCard agentName="engineer" description="Some task" status="success">
        <div>Child content</div>
      </AgentCard>,
    );

    const header = container.querySelector("[data-testid='agent-card-header']")!;
    fireEvent.click(header);

    const detail = container.querySelector("[data-testid='agent-card-detail']") as HTMLElement;
    expect(detail).not.toBeNull();
    // Border-top now via Tailwind classes
    expect(detail.className).toContain("border-t");
    expect(detail.className).toContain("border-[var(--bd)]");
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
