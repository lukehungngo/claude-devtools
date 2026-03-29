/**
 * Tests for PromptInput textarea conversion (TASK-001) and slash commands (TASK-002)
 *
 * Verifies that:
 * - Component renders a textarea (not an input)
 * - Enter key triggers submit
 * - Shift+Enter does not trigger submit
 * - Typing "/" shows slash command dropdown
 * - Typing "/he" filters to show only /help
 * - Pressing Escape closes the dropdown
 * - Submitting "/help" does NOT call fetch (returns local output)
 * - Submitting "/unknownxyz" does NOT call fetch (shows unknown command message)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

// Mock useDiscoveryCommands to prevent fetch calls from the hook
vi.mock("../../hooks/useDiscovery", () => ({
  useDiscoveryCommands: () => [
    { name: "/help", description: "Show available commands" },
    { name: "/clear", description: "Clear context (starts new session)" },
    { name: "/compact", description: "Compact the conversation context" },
    { name: "/context", description: "Show context window usage" },
    { name: "/copy", description: "Copy last assistant response(s) to clipboard" },
    { name: "/cost", description: "Show session cost summary" },
    { name: "/diff", description: "Show git diff (uncommitted changes)" },
    { name: "/effort", description: "Set effort level (low | medium | high)" },
    { name: "/fast", description: "Toggle fast mode (on | off)" },
    { name: "/hooks", description: "View configured hooks" },
    { name: "/init", description: "Initialize CLAUDE.md in project" },
    { name: "/mcp", description: "Show connected MCP servers and tools" },
    { name: "/memory", description: "View CLAUDE.md content" },
    { name: "/model", description: "Show current model info" },
    { name: "/permissions", description: "Show permission mode and allowances" },
    { name: "/plan", description: "Switch to plan mode (read-only)" },
    { name: "/rename", description: "Rename the current session" },
    { name: "/rewind", description: "Rewind conversation (optional: N turns)" },
    { name: "/settings", description: "View session settings" },
    { name: "/tasks", description: "Show task summary" },
    { name: "/analytics", description: "Show cross-session analytics" },
    { name: "/usage", description: "Show rate limit utilization" },
    { name: "/export", description: "Export conversation (md | json)" },
    { name: "/shortcuts", description: "Show keyboard shortcuts" },
    { name: "/doctor", description: "Run system diagnostics" },
    { name: "/stats", description: "Show usage statistics" },
    { name: "/exit", description: "Exit the current session" },
  ],
}));

import { PromptInput } from "./PromptInput";

// Mock fetch for submit tests
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PromptInput", () => {
  it("renders a textarea element, not an input", () => {
    const { container } = render(<PromptInput />);
    const textarea = container.querySelector("textarea");
    const input = container.querySelector("input");
    expect(textarea).not.toBeNull();
    expect(input).toBeNull();
  });

  it("Enter key triggers submit when prompt is non-empty", () => {
    const { container } = render(<PromptInput />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    // After submit the textarea should be cleared (prompt reset to "")
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("Shift+Enter does not trigger submit", () => {
    const { container } = render(<PromptInput />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // Prompt value should remain (no submit happened)
    expect((textarea as HTMLTextAreaElement).value).toBe("hello");
  });

  describe("slash command dropdown", () => {
    it("shows the dropdown when typing /", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/" } });

      // Dropdown should be visible with command items
      const dropdown = container.querySelector(".bg-dt-bg3.border.border-dt-border.rounded-xl");
      expect(dropdown).not.toBeNull();

      // Should show /help, /clear, /compact among others
      const commandNames = Array.from(container.querySelectorAll(".font-mono.font-semibold")).map(
        (el) => el.textContent
      );
      expect(commandNames).toContain("/help");
      expect(commandNames).toContain("/clear");
      expect(commandNames).toContain("/compact");
    });

    it("filters commands when typing /he", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/he" } });

      // Only /help should match
      const commandNames = Array.from(container.querySelectorAll(".font-mono.font-semibold")).map(
        (el) => el.textContent
      );
      expect(commandNames).toContain("/help");
      expect(commandNames).not.toContain("/clear");
      expect(commandNames).not.toContain("/compact");
    });

    it("hides dropdown when Escape is pressed", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/" } });
      // Dropdown should be visible
      const dropdownBefore = container.querySelector(".bg-dt-bg3.border.border-dt-border.rounded-xl");
      expect(dropdownBefore).not.toBeNull();

      fireEvent.keyDown(textarea, { key: "Escape" });

      // Dropdown should be hidden
      const dropdownAfter = container.querySelector(".bg-dt-bg3.border.border-dt-border.rounded-xl");
      expect(dropdownAfter).toBeNull();
    });

    it("hides dropdown when a space is typed", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/" } });
      const dropdownBefore = container.querySelector(".bg-dt-bg3.border.border-dt-border.rounded-xl");
      expect(dropdownBefore).not.toBeNull();

      fireEvent.change(textarea, { target: { value: "/help " } });
      const dropdownAfter = container.querySelector(".bg-dt-bg3.border.border-dt-border.rounded-xl");
      expect(dropdownAfter).toBeNull();
    });
  });

  describe("session-aware endpoint routing", () => {
    it("POSTs to /api/sessions/:id/message when activeSessionId is set", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-abc-123" sessionCwd="/tmp" sessionId="old-id" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-abc-123/message");
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ prompt: "hello" });
      // Should NOT include cwd or sessionId
      expect(body.cwd).toBeUndefined();
      expect(body.sessionId).toBeUndefined();
    });

    it("resumes the viewed session then sends message via session API", async () => {
      const { container } = render(
        <PromptInput sessionCwd="/projects/foo" sessionId="sid-456" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // First call: resume the session, second call: send message
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [resumeUrl] = fetchMock.mock.calls[0];
      expect(resumeUrl).toBe("/api/sessions/sid-456/resume");
      const [msgUrl, msgOpts] = fetchMock.mock.calls[1];
      expect(msgUrl).toBe("/api/sessions/sid-456/message");
      const body = JSON.parse(msgOpts.body);
      expect(body.prompt).toBe("hello");
    });
  });

  describe("client-side slash command handling", () => {
    it("submitting /help does NOT call fetch and shows local output", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      // Type /help with a space so the dropdown hides, then submit
      fireEvent.change(textarea, { target: { value: "/help " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      // fetch should NOT have been called
      expect(fetchMock).not.toHaveBeenCalled();

      // Should show some output message
      await act(async () => {});
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("Available commands");
    });

    it("submitting /compact sends it as a message via fetch (no focus)", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-compact-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      // Type "/compact " with trailing space so dropdown dismisses
      fireEvent.change(textarea, { target: { value: "/compact " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // /compact should call fetch (sent as a message, not handled locally)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-compact-1/message");
      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("/compact ");
    });

    it("submitting /compact with focus text sends the full string as a message", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-compact-2" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/compact focus on auth module" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-compact-2/message");
      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("/compact focus on auth module");
    });

    it("submitting /unknownxyz does NOT call fetch and shows unknown command message", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      // /unknownxyz has no matches so dropdown is already hidden
      fireEvent.change(textarea, { target: { value: "/unknownxyz" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      // fetch should NOT have been called
      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {});
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toBe("Unknown command: /unknownxyz");
    });
  });

  describe("/clear command", () => {
    it("calls POST /api/sessions/new and invokes onSessionStarted", async () => {
      const onSessionStarted = vi.fn();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessionId: "new-session-123" }),
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/projects/foo"
          sessionId="old-session"
          onSessionStarted={onSessionStarted}
        />
      );
      const textarea = container.querySelector("textarea")!;

      // /clear is a server-forwarded command; Enter submits directly even with dropdown visible
      fireEvent.change(textarea, { target: { value: "/clear" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // Should have called POST /api/sessions/new with the current cwd
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/new");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.cwd).toBe("/projects/foo");

      // Should notify parent with new session id
      expect(onSessionStarted).toHaveBeenCalledWith("new-session-123");
    });

    it("uses fallback cwd '/' when sessionCwd is not provided", async () => {
      const onSessionStarted = vi.fn();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessionId: "new-session-456" }),
      });

      const { container } = render(
        <PromptInput onSessionStarted={onSessionStarted} />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/clear" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.cwd).toBe("/");
      expect(onSessionStarted).toHaveBeenCalledWith("new-session-456");
    });
  });

  describe("/model command", () => {
    it("shows current model info when /model has no argument", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      // No fetch should have been made (no active session, just shows info)
      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {});
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("model");
    });

    it("/model opus sends POST to model endpoint with full model name", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, model: "claude-opus-4-6" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-123" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model opus" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-123/model");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.model).toBe("claude-opus-4-6");
    });

    it("/model sonnet maps to claude-sonnet-4-6", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, model: "claude-sonnet-4-6" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-123" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model sonnet" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("claude-sonnet-4-6");
    });

    it("/model haiku maps to claude-haiku-4-5-20251001", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, model: "claude-haiku-4-5-20251001" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-123" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model haiku" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("claude-haiku-4-5-20251001");
    });

    it("/model with no active session shows error", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model opus" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // No fetch should have been made since there's no active session
      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {});
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("No active session");
    });

    it("shows confirmation message after successful model switch", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, model: "claude-opus-4-6" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-123" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/model opus" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("claude-opus-4-6");
    });
  });

  describe("/plan command", () => {
    it("switches to plan mode via permission-mode endpoint", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, mode: "plan" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" sessionId="sess-1" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/plan " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-1/permission-mode");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.mode).toBe("plan");

      // Should show confirmation
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("Plan mode");
    });

    it("/plan off switches back to default mode", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, mode: "default" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" sessionId="sess-1" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/plan off" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-1/permission-mode");
      const body = JSON.parse(opts.body);
      expect(body.mode).toBe("default");

      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("Default mode");
    });

    it("/plan with no active session shows error", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/plan " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).not.toHaveBeenCalled();

      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("No active session");
    });
  });

  describe("! bash prefix", () => {
    it("sends ! prefixed text to bash endpoint", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stdout: "output", stderr: "", exitCode: 0 }),
      });

      const onBashOutput = vi.fn();
      const { container } = render(
        <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" onBashOutput={onBashOutput} />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "!ls -la" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // Should have called the bash endpoint
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-1/bash");
      const body = JSON.parse(opts.body);
      expect(body.command).toBe("ls -la");
    });

    it("shows error when no active session for ! command", async () => {
      const { container } = render(
        <PromptInput sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "!ls" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // Should not call fetch
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows usage message for empty ! command", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "!" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // Should not call fetch (empty command)
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("/fast command", () => {
    it("/fast on sends POST to fast endpoint with enabled: true", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, fastMode: true }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-fast-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/fast on" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-fast-1/fast");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(true);
    });

    it("/fast off sends POST to fast endpoint with enabled: false", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, fastMode: false }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-fast-2" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/fast off" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.enabled).toBe(false);
    });

    it("/fast with no arg toggles (sends toggle request)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, fastMode: true }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-fast-3" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      // Trailing space dismisses dropdown so Enter submits
      fireEvent.change(textarea, { target: { value: "/fast " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      // Should call the fast endpoint (toggle behavior)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-fast-3/fast");
    });

    it("/fast with no active session shows error", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/fast on" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("No active session");
    });
  });

  describe("/effort command", () => {
    it("/effort low sends POST to effort endpoint", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, effortLevel: "low" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-effort-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort low" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-effort-1/effort");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.level).toBe("low");
    });

    it("/effort medium sends POST to effort endpoint", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, effortLevel: "medium" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-effort-2" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort medium" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.level).toBe("medium");
    });

    it("/effort high sends POST to effort endpoint", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, effortLevel: "high" }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-effort-3" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort high" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.level).toBe("high");
    });

    it("/effort with no arg shows current level info", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(fetchMock).not.toHaveBeenCalled();
      await act(async () => {});
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("effort");
    });

    it("/effort with no active session shows error", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort low" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("No active session");
    });

    it("/effort with invalid level shows error", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-effort-4" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/effort turbo" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
      expect(output).not.toBeNull();
      expect(output!.textContent).toContain("low");
    });
  });

  describe("@ file path autocomplete", () => {
    it("typing @ triggers file autocomplete state (shows dropdown after fetch)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: ["src/", "package.json", "README.md"] }),
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/projects/foo"
          sessionId="sid-1"
          projectHash="hash-1"
        />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello @" } });

      // Advance debounce timer (200ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Wait for fetch to resolve
      await act(async () => {});

      // Should have fetched files from API
      const fileCall = fetchMock.mock.calls.find(
        (c: string[]) => typeof c[0] === "string" && c[0].includes("/files")
      );
      expect(fileCall).toBeDefined();
      expect(fileCall![0]).toContain("/api/sessions/hash-1/sid-1/files?prefix=");

      // Should show a file dropdown
      const fileItems = container.querySelectorAll("[data-testid='file-option']");
      expect(fileItems.length).toBeGreaterThan(0);
    });

    it("selecting a file inserts the full path after @", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ files: ["src/", "package.json"] }),
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/projects/foo"
          sessionId="sid-1"
          projectHash="hash-1"
        />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "@" } });

      // Advance debounce
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      await act(async () => {});

      // Select the first item via mousedown
      const fileItems = container.querySelectorAll("[data-testid='file-option']");
      expect(fileItems.length).toBeGreaterThan(0);
      fireEvent.mouseDown(fileItems[0]);

      // Textarea should now contain the selected file path
      const value = (textarea as HTMLTextAreaElement).value;
      expect(value).toContain("@src/");
    });

    it("does not trigger file autocomplete when projectHash is missing", async () => {
      const { container } = render(
        <PromptInput sessionCwd="/projects/foo" sessionId="sid-1" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "@src" } });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      await act(async () => {});

      // No fetch call for files
      const fileCall = fetchMock.mock.calls.find(
        (c: string[]) => typeof c[0] === "string" && c[0].includes("/files")
      );
      expect(fileCall).toBeUndefined();
    });
  });

  describe("T2-11: Ctrl+C cancel binding", () => {
    it("aborts streaming when Ctrl+C is pressed during active generation", async () => {
      vi.useRealTimers();
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");

      // Mock fetch to return a stream that never completes (simulates ongoing generation)
      const mockReader = {
        read: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      };
      fetchMock.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/test"
          sessionId="sess-1"
          projectHash="proj-1"
          activeSessionId="active-1"
        />
      );
      const textarea = container.querySelector("textarea")!;

      // Type a prompt and submit to enter running state
      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
      });

      // Verify component is in running state (stop button visible)
      const stopButton = container.querySelector("button");
      expect(stopButton?.textContent).toContain("Stop");

      // Press Ctrl+C on the document
      await act(async () => {
        fireEvent.keyDown(document, { key: "c", ctrlKey: true });
      });

      expect(abortSpy).toHaveBeenCalled();
    });

    it("does not abort when Ctrl+C is pressed while idle (allows normal copy)", () => {
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");

      render(<PromptInput />);

      // Press Ctrl+C while idle -- should not trigger abort
      fireEvent.keyDown(document, { key: "c", ctrlKey: true });

      expect(abortSpy).not.toHaveBeenCalled();
    });
  });

  describe("T2-12: /rewind command", () => {
    it("/rewind sends it as a message via fetch (same as /compact)", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-rewind-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/rewind " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-rewind-1/message");
      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("/rewind ");
    });

    it("/rewind 3 sends the full string as a message", async () => {
      const { container } = render(
        <PromptInput activeSessionId="sess-rewind-2" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/rewind 3" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-rewind-2/message");
      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("/rewind 3");
    });

    it("/rewind appears in slash command dropdown", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/rew" } });

      const commandNames = Array.from(
        container.querySelectorAll(".font-mono.font-semibold")
      ).map((el) => el.textContent);
      expect(commandNames).toContain("/rewind");
    });
  });

  describe("T2-15: Image paste/upload", () => {
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

    function mockFileReaderGlobal() {
      const original = globalThis.FileReader;
      const mockFR = {
        readAsDataURL: vi.fn(),
        result: mockDataUrl,
        onload: null as (() => void) | null,
      };
      vi.stubGlobal("FileReader", vi.fn(() => mockFR));
      return { mockFR, restore: () => { globalThis.FileReader = original; } };
    }

    function pasteImageOnTextarea(textarea: HTMLTextAreaElement) {
      const file = new File(["fake-image-data"], "screenshot.png", { type: "image/png" });
      const clipboardData = {
        items: [
          {
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      };
      fireEvent.paste(textarea, { clipboardData });
    }

    it("pasting an image creates an attachment and shows thumbnail preview", async () => {
      const { mockFR, restore } = mockFileReaderGlobal();

      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      await act(async () => {
        pasteImageOnTextarea(textarea);
        // Simulate FileReader onload callback
        if (mockFR.onload) mockFR.onload();
      });

      // Should show image preview thumbnail
      const preview = container.querySelector("[data-testid='image-attachment-preview']");
      expect(preview).not.toBeNull();

      // Should show a remove button
      const removeBtn = container.querySelector("[data-testid='image-attachment-remove']");
      expect(removeBtn).not.toBeNull();

      restore();
    });

    it("clicking remove button clears the image attachment", async () => {
      const { mockFR, restore } = mockFileReaderGlobal();

      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      await act(async () => {
        pasteImageOnTextarea(textarea);
        if (mockFR.onload) mockFR.onload();
      });

      expect(container.querySelector("[data-testid='image-attachment-preview']")).not.toBeNull();

      // Click remove
      await act(async () => {
        const removeBtn = container.querySelector("[data-testid='image-attachment-remove']")!;
        fireEvent.click(removeBtn);
      });

      expect(container.querySelector("[data-testid='image-attachment-preview']")).toBeNull();

      restore();
    });

    it("submitting with an image attachment includes it in the request body", async () => {
      vi.useRealTimers();
      const { mockFR, restore } = mockFileReaderGlobal();

      const { container } = render(
        <PromptInput activeSessionId="sess-img-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      // Paste an image
      await act(async () => {
        pasteImageOnTextarea(textarea);
        if (mockFR.onload) mockFR.onload();
      });

      // Type a prompt and submit
      fireEvent.change(textarea, { target: { value: "analyze this image" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgCall = fetchMock.mock.calls.find(
        (c: any[]) => typeof c[0] === "string" && c[0].includes("/message")
      );
      expect(msgCall).toBeDefined();
      const body = JSON.parse(msgCall![1].body);
      expect(body.images).toBeDefined();
      expect(body.images).toHaveLength(1);
      expect(body.images[0].dataUrl).toBe(mockDataUrl);

      restore();
    });
  });

  describe("T2-19: SSE error surfacing", () => {
    it("shows error banner when SSE result contains an error", async () => {
      vi.useRealTimers();

      const errorPayload = JSON.stringify({
        type: "result",
        is_error: true,
        error: "Rate limit exceeded",
      });
      const sseData = `data: ${errorPayload}\n\n`;
      const encoder = new TextEncoder();
      let readCount = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          readCount++;
          if (readCount === 1) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(sseData),
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };
      fetchMock.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/test"
          sessionId="sess-1"
          projectHash="proj-1"
          activeSessionId="active-1"
        />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
        await new Promise((r) => setTimeout(r, 50));
      });

      const banner = container.querySelector("[data-testid='sse-error-banner']");
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain("Rate limit exceeded");
    });

    it("dismisses error banner when dismiss button is clicked", async () => {
      vi.useRealTimers();

      const errorPayload = JSON.stringify({
        type: "result",
        is_error: true,
        error: "Something went wrong",
      });
      const sseData = `data: ${errorPayload}\n\n`;
      const encoder = new TextEncoder();
      let readCount = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          readCount++;
          if (readCount === 1) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(sseData),
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };
      fetchMock.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const { container } = render(
        <PromptInput
          sessionCwd="/test"
          sessionId="sess-1"
          projectHash="proj-1"
          activeSessionId="active-1"
        />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
        await new Promise((r) => setTimeout(r, 50));
      });

      // Banner should exist
      expect(container.querySelector("[data-testid='sse-error-banner']")).not.toBeNull();

      // Click dismiss
      await act(async () => {
        const dismissBtn = container.querySelector("[data-testid='sse-error-dismiss']");
        expect(dismissBtn).not.toBeNull();
        fireEvent.click(dismissBtn!);
      });

      // Banner should be gone
      expect(container.querySelector("[data-testid='sse-error-banner']")).toBeNull();
    });
  });

  describe("/diff command", () => {
    it("shows in the slash command dropdown", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/dif" } });

      const dropdown = container.querySelectorAll(".text-dt-accent");
      const names = Array.from(dropdown).map((el) => el.textContent);
      expect(names).toContain("/diff");
    });

    it("fetches git-diff endpoint and displays output", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ diff: " src/index.ts | 5 ++---\n 1 file changed\n" }),
      });

      const { container } = render(
        <PromptInput projectHash="projHash" sessionId="sess1" />
      );
      const textarea = container.querySelector("textarea")!;

      // Trailing space bypasses dropdown interception on Enter
      fireEvent.change(textarea, { target: { value: "/diff " } });
      // Fire Enter to trigger submitPrompt, then flush microtasks for async fetch
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/sessions/projHash/sess1/git-diff");
      expect(container.textContent).toContain("src/index.ts");
    });

    it("shows fallback when no session selected", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      // Trailing space bypasses dropdown interception on Enter
      fireEvent.change(textarea, { target: { value: "/diff " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.textContent).toContain("No session selected");
    });
  });

  describe("/mcp command", () => {
    it("shows in the slash command dropdown", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/mc" } });

      const dropdown = container.querySelectorAll(".text-dt-accent");
      const names = Array.from(dropdown).map((el) => el.textContent);
      expect(names).toContain("/mcp");
    });

    it("shows MCP server grouping when metrics have MCP tools", async () => {
      const metrics = {
        session: { id: "s1", projectHash: "h", path: "/tmp/t.jsonl", startTime: "", lastModified: "", eventCount: 0, subagentCount: 0 },
        dag: { nodes: [], edges: [] },
        tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
        tokensByModel: {},
        tokensByTurn: [],
        tools: [
          { name: "mcp__fs__read", count: 5, errors: 0, isMcp: true, mcpServer: "filesystem" },
          { name: "mcp__fs__write", count: 3, errors: 0, isMcp: true, mcpServer: "filesystem" },
          { name: "mcp__gh__pr", count: 2, errors: 0, isMcp: true, mcpServer: "github" },
        ],
        totalEvents: 0,
        totalToolCalls: 0,
        totalAgents: 0,
        models: [],
        duration: 0,
        contextPercent: 0,
        contextWindowSize: 200000,
        tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
        hasRemoteControl: false,
      };

      const { container } = render(<PromptInput metrics={metrics} />);
      const textarea = container.querySelector("textarea")!;

      // Trailing space bypasses dropdown interception on Enter
      fireEvent.change(textarea, { target: { value: "/mcp " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(container.textContent).toContain("filesystem");
      expect(container.textContent).toContain("github");
    });

    it("shows 'No MCP servers connected' when no MCP tools", async () => {
      const metrics = {
        session: { id: "s1", projectHash: "h", path: "/tmp/t.jsonl", startTime: "", lastModified: "", eventCount: 0, subagentCount: 0 },
        dag: { nodes: [], edges: [] },
        tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
        tokensByModel: {},
        tokensByTurn: [],
        tools: [],
        totalEvents: 0,
        totalToolCalls: 0,
        totalAgents: 0,
        models: [],
        duration: 0,
        contextPercent: 0,
        contextWindowSize: 200000,
        tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
        hasRemoteControl: false,
      };

      const { container } = render(<PromptInput metrics={metrics} />);
      const textarea = container.querySelector("textarea")!;

      // Trailing space bypasses dropdown interception on Enter
      fireEvent.change(textarea, { target: { value: "/mcp " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(container.textContent).toContain("No MCP servers connected");
    });
  });

  describe("/tasks command (T2-16)", () => {
    it("shows in the slash command dropdown", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/ta" } });

      const dropdown = container.querySelectorAll(".text-dt-accent");
      const names = Array.from(dropdown).map((el) => el.textContent);
      expect(names).toContain("/tasks");
    });

    it("shows task summary when metrics have tasks", async () => {
      const metrics = {
        session: { id: "s1", projectHash: "h", path: "/tmp/t.jsonl", startTime: "", lastModified: "", eventCount: 0, subagentCount: 0 },
        dag: { nodes: [], edges: [] },
        tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
        tokensByModel: {},
        tokensByTurn: [],
        tools: [],
        totalEvents: 0,
        totalToolCalls: 0,
        totalAgents: 0,
        models: [],
        duration: 0,
        contextPercent: 0,
        contextWindowSize: 200000,
        tasks: { total: 5, completed: 3, inProgress: 1, pending: 1 },
        hasRemoteControl: false,
      };

      const { container } = render(<PromptInput metrics={metrics} />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/tasks " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("3/5");
      expect(container.textContent).toContain("3 completed");
    });

    it("shows 'No tasks' when no tasks exist", async () => {
      const metrics = {
        session: { id: "s1", projectHash: "h", path: "/tmp/t.jsonl", startTime: "", lastModified: "", eventCount: 0, subagentCount: 0 },
        dag: { nodes: [], edges: [] },
        tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
        tokensByModel: {},
        tokensByTurn: [],
        tools: [],
        totalEvents: 0,
        totalToolCalls: 0,
        totalAgents: 0,
        models: [],
        duration: 0,
        contextPercent: 0,
        contextWindowSize: 200000,
        tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
        hasRemoteControl: false,
      };

      const { container } = render(<PromptInput metrics={metrics} />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/tasks " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("No tasks");
    });
  });

  describe("/analytics command (T2-18)", () => {
    it("shows in the slash command dropdown", () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/an" } });

      const dropdown = container.querySelectorAll(".text-dt-accent");
      const names = Array.from(dropdown).map((el) => el.textContent);
      expect(names).toContain("/analytics");
    });

    it("shows analytics data when costs are provided", async () => {
      const costs = {
        cost24h: 5.25,
        cost7d: 18.50,
        sessionCount24h: 10,
        sessionCount7d: 35,
        tokenIn24h: 500000,
        tokenOut24h: 100000,
        tokenIn7d: 2000000,
        tokenOut7d: 400000,
      };

      const { container } = render(<PromptInput costs={costs} />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/analytics " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("10 sessions (24h)");
      expect(container.textContent).toContain("$5.25");
    });

    it("shows fallback when costs are null", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/analytics " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("No analytics data");
    });
  });

  describe("/context command", () => {
    it("shows context percentage and status when metrics are available", async () => {
      const metrics = {
        session: { id: "s1", projectHash: "h", path: "/tmp/t.jsonl", startTime: "", lastModified: "", eventCount: 0, subagentCount: 0 },
        dag: { nodes: [], edges: [] },
        tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 },
        tokensByModel: {},
        tokensByTurn: [],
        tools: [],
        totalEvents: 0,
        totalToolCalls: 0,
        totalAgents: 0,
        models: [],
        duration: 0,
        contextPercent: 42,
        contextWindowSize: 200000,
        tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
        hasRemoteControl: false,
      };

      const { container } = render(<PromptInput metrics={metrics} />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/context " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("42%");
      expect(container.textContent).toContain("OK");
      expect(container.textContent).toContain("200K");
    });

    it("shows fallback when metrics are null", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/context " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      await act(async () => {});

      expect(container.textContent).toContain("No session data");
    });

    it("does NOT call fetch (handled locally)", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/context " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("/permissions command", () => {
    it("fetches permissions info and shows mode and allowances", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          mode: "default",
          allowances: ["Bash", "Write"],
          pendingCount: 1,
        }),
      });

      const { container } = render(
        <PromptInput activeSessionId="sess-perm-1" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/permissions " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/sessions/sess-perm-1/permissions-info");
      expect(container.textContent).toContain("default");
      expect(container.textContent).toContain("Bash");
      expect(container.textContent).toContain("Write");
      expect(container.textContent).toContain("1");
    });

    it("shows fallback when no active session", async () => {
      const { container } = render(<PromptInput />);
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/permissions " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(container.textContent).toContain("No permission data");
    });

    it("shows fallback when fetch fails", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network error"));

      const { container } = render(
        <PromptInput activeSessionId="sess-perm-2" sessionCwd="/tmp" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "/permissions " } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(container.textContent).toContain("No permission data");
    });
  });

});
