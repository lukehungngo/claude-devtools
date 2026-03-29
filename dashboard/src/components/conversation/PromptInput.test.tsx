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

});
