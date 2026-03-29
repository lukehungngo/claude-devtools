/**
 * Reproduction tests for GROUP-5 bugs:
 * 1. onOpenPanel not wired from ConversationView to PromptInput
 * 2. hasMessages and lastTurnHadError ghost text props not passed
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { ConversationView } from "../components/conversation/ConversationView";
import type { SessionEvent, SessionMetrics } from "../lib/types";
import { LayoutContext } from "../contexts/LayoutContext";
import type { LayoutContextValue } from "../contexts/LayoutContext";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Minimal LayoutContext value for tests
function makeLayoutCtx(overrides?: Partial<LayoutContextValue>): LayoutContextValue {
  return {
    repos: [],
    reposLoading: false,
    refreshRepos: () => {},
    permissions: [],
    decidePermission: async () => {},
    decidePermissionSession: async () => {},
    usage: null,
    costs: null,
    isLive: false,
    registerSessionHandlers: () => {},
    currentMetrics: null,
    setCurrentMetrics: () => {},
    toolFilter: null,
    setToolFilter: () => {},
    requestedRightTab: undefined,
    setRequestedRightTab: () => {},
    rightPanelContent: null,
    setRightPanelContent: () => {},
    questions: [],
    submitAnswer: async () => {},
    activeSessionId: null,
    setActiveSessionId: () => {},
    selected: null,
    setSelected: () => {},
    slugMap: new Map(),
    reverseSlugMap: new Map(),
    ...overrides,
  };
}

// Helper to build a minimal assistant event
function makeAssistantEvent(text: string, uuid: string): SessionEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: new Date().toISOString(),
    message: {
      id: uuid,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  } as SessionEvent;
}

function makeUserEvent(text: string, uuid: string): SessionEvent {
  return {
    type: "user",
    uuid,
    timestamp: new Date().toISOString(),
    userType: "external",
    sessionId: "test-session",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  } as SessionEvent;
}

function makeUserEventWithError(uuid: string): SessionEvent {
  return {
    type: "user",
    uuid,
    timestamp: new Date().toISOString(),
    userType: "external",
    sessionId: "test-session",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "Error occurred", is_error: true }],
    },
  } as SessionEvent;
}

describe("GROUP-5: onOpenPanel wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
    })));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes onOpenPanel callback to PromptInput", async () => {
    const onOpenPanel = vi.fn();
    const ctx = makeLayoutCtx();

    const { container } = render(
      <LayoutContext.Provider value={ctx}>
        <ConversationView
          events={[]}
          metrics={null}
          onOpenPanel={onOpenPanel}
        />
      </LayoutContext.Provider>,
    );

    // Type /doctor into the textarea and submit
    const textarea = container.querySelector("textarea")!;
    expect(textarea).not.toBeNull();

    // Trailing space hides the dropdown so Enter goes through normal submit path
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/doctor " } });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // onOpenPanel should have been called with "doctor"
    expect(onOpenPanel).toHaveBeenCalledWith("doctor");
  });
});

describe("GROUP-5: ghost text props wiring", () => {
  it("passes hasMessages=false when no events (ghost text shows starter)", () => {
    const ctx = makeLayoutCtx();

    const { getByTestId } = render(
      <LayoutContext.Provider value={ctx}>
        <ConversationView events={[]} metrics={null} />
      </LayoutContext.Provider>,
    );

    const ghost = getByTestId("ghost-suggestion");
    expect(ghost.textContent).toBe("Describe what you'd like to build...");
  });

  it("passes hasMessages=true when events exist (ghost text shows continue)", () => {
    const ctx = makeLayoutCtx();
    const events = [
      makeUserEvent("hello", "u1"),
      makeAssistantEvent("world", "a1"),
    ];

    const { getByTestId } = render(
      <LayoutContext.Provider value={ctx}>
        <ConversationView events={events} metrics={null} />
      </LayoutContext.Provider>,
    );

    const ghost = getByTestId("ghost-suggestion");
    expect(ghost.textContent).toBe("Continue with next steps...");
  });

  it("passes lastTurnHadError=true when last turn has error (ghost text shows fix)", () => {
    const ctx = makeLayoutCtx();
    const events = [
      makeUserEvent("hello", "u1"),
      makeAssistantEvent("Let me try", "a1"),
      makeUserEventWithError("u2"),
    ];

    const { getByTestId } = render(
      <LayoutContext.Provider value={ctx}>
        <ConversationView events={events} metrics={null} />
      </LayoutContext.Provider>,
    );

    const ghost = getByTestId("ghost-suggestion");
    expect(ghost.textContent).toBe("Fix the error above");
  });
});
