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

    it("POSTs to /api/command when activeSessionId is not set (backward compat)", async () => {
      const { container } = render(
        <PromptInput sessionCwd="/projects/foo" sessionId="sid-456" />
      );
      const textarea = container.querySelector("textarea")!;

      fireEvent.change(textarea, { target: { value: "hello" } });
      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/command");
      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("hello");
      expect(body.cwd).toBe("/projects/foo");
      expect(body.sessionId).toBe("sid-456");
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
});
