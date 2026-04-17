import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AgentPills } from "./AgentPills";
import type { AgentSummary } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent } from "../../lib/types";

function makeAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    agentId: "main",
    agentType: "main",
    displayName: "Main",
    invocationCount: 1,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    tools: [],
    ...overrides,
  };
}

function makeMainAssistant(stopReason: "end_turn" | "tool_use" | null): AssistantEvent {
  return {
    type: "assistant",
    uuid: "asst-main-1",
    timestamp: "2026-01-01T00:00:01Z",
    sessionId: "sess-1",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      model: "claude-sonnet-4-5",
      id: "msg-1",
      type: "message",
      stop_reason: stopReason,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  } as AssistantEvent;
}

describe("AgentPills — three-state status dot", () => {
  it("T-PILL-1 'completed' when main has end_turn → green dot", () => {
    const events: SessionEvent[] = [makeMainAssistant("end_turn")];
    const { container } = render(
      <AgentPills
        agents={[makeAgent()]}
        turnEvents={events}
        sessionIsRunning={true}
      />,
    );
    const dot = container.querySelector('[data-testid="agent-pill-dot-main"]');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute("data-status")).toBe("completed");
    expect(dot!.className).toContain("bg-dt-green");
  });

  it("T-PILL-2 'running' when no signal AND sessionIsRunning=true → amber pulse", () => {
    const events: SessionEvent[] = [makeMainAssistant("tool_use")];
    const { container } = render(
      <AgentPills
        agents={[makeAgent()]}
        turnEvents={events}
        sessionIsRunning={true}
      />,
    );
    const dot = container.querySelector('[data-testid="agent-pill-dot-main"]');
    expect(dot!.getAttribute("data-status")).toBe("running");
    expect(dot!.className).toContain("bg-dt-accent");
    expect(dot!.className).toContain("animate-pulse-opacity");
  });

  it("T-PILL-3 'indeterminate' when no signal AND sessionIsRunning=false → grey static dot", () => {
    // The specific dishonesty the brainstorm called out: closed session,
    // no terminal signal. Must render honest grey, not pulsing amber.
    const events: SessionEvent[] = [makeMainAssistant("tool_use")];
    const { container } = render(
      <AgentPills
        agents={[makeAgent()]}
        turnEvents={events}
        sessionIsRunning={false}
      />,
    );
    const dot = container.querySelector('[data-testid="agent-pill-dot-main"]');
    expect(dot!.getAttribute("data-status")).toBe("indeterminate");
    expect(dot!.className).toContain("bg-dt-text2");
    expect(dot!.className).not.toContain("animate-pulse-opacity");
    expect(dot!.getAttribute("title")).toContain("Session ended");
  });

  it("T-PILL-4 legacy caller (undefined sessionIsRunning) still shows running for active agents", () => {
    // Backwards-compat: when the prop is omitted, assume active. Pre-remediation
    // callers don't thread this through yet; they should keep working.
    const events: SessionEvent[] = [makeMainAssistant("tool_use")];
    const { container } = render(
      <AgentPills agents={[makeAgent()]} turnEvents={events} />,
    );
    const dot = container.querySelector('[data-testid="agent-pill-dot-main"]');
    expect(dot!.getAttribute("data-status")).toBe("running");
  });

  it("returns null when no agents", () => {
    const { container } = render(
      <AgentPills agents={[]} turnEvents={[]} sessionIsRunning={true} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
