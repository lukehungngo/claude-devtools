/**
 * Tests for /copy command (T2-06) and command history (T2-07)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { PromptInput } from "./PromptInput";

let fetchMock: ReturnType<typeof vi.fn>;
let clipboardWriteMock: ReturnType<typeof vi.fn>;

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

  clipboardWriteMock = vi.fn(() => Promise.resolve());
  Object.assign(navigator, {
    clipboard: { writeText: clipboardWriteMock },
  });

  vi.useFakeTimers();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/copy command", () => {
  it("shows confirmation message when /copy is used", async () => {
    const getAssistantResponses = vi.fn(() => ["Hello from Claude"]);

    const { container } = render(
      <PromptInput getAssistantResponses={getAssistantResponses} />
    );
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/copy " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await act(async () => {});

    const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
    expect(output).not.toBeNull();
    expect(output!.textContent).toContain("Copied 1 response");
  });

  it("/copy 3 copies the last 3 responses", async () => {
    const getAssistantResponses = vi.fn(() => [
      "Response 1",
      "Response 2",
      "Response 3",
    ]);

    const { container } = render(
      <PromptInput getAssistantResponses={getAssistantResponses} />
    );
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/copy 3" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await act(async () => {});

    expect(getAssistantResponses).toHaveBeenCalledWith(3);

    const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
    expect(output).not.toBeNull();
    expect(output!.textContent).toContain("Copied 3 responses");
  });

  it("/copy shows error when no responses available", async () => {
    const getAssistantResponses = vi.fn(() => []);

    const { container } = render(
      <PromptInput getAssistantResponses={getAssistantResponses} />
    );
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/copy " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await act(async () => {});

    const output = container.querySelector(".text-xs.text-dt-text2.px-1.pt-1.font-mono");
    expect(output).not.toBeNull();
    expect(output!.textContent).toContain("No responses");
  });

  it("/copy does not call fetch", async () => {
    const getAssistantResponses = vi.fn(() => ["Hello"]);

    const { container } = render(
      <PromptInput getAssistantResponses={getAssistantResponses} />
    );
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/copy " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("/copy appears in slash command dropdown", () => {
    const { container } = render(<PromptInput />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/co" } });

    const commandNames = Array.from(
      container.querySelectorAll(".font-mono.font-semibold")
    ).map((el) => el.textContent);
    expect(commandNames).toContain("/copy");
  });
});

describe("command history", () => {
  it("ArrowUp recalls the previous prompt", async () => {
    const { container } = render(
      <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
    );
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    // Submit a prompt
    fireEvent.change(textarea, { target: { value: "first prompt" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    // Now press ArrowUp to recall it
    fireEvent.keyDown(textarea, { key: "ArrowUp" });

    expect(textarea.value).toBe("first prompt");
  });

  it("ArrowDown navigates forward through history", async () => {
    const { container } = render(
      <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
    );
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    // Submit two prompts
    fireEvent.change(textarea, { target: { value: "first" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    fireEvent.change(textarea, { target: { value: "second" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    // ArrowUp twice to get to "first"
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(textarea.value).toBe("second");

    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(textarea.value).toBe("first");

    // ArrowDown to go back to "second"
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect(textarea.value).toBe("second");

    // ArrowDown again to restore draft (empty)
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect(textarea.value).toBe("");
  });

  it("preserves current draft when navigating history", async () => {
    const { container } = render(
      <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
    );
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    // Submit a prompt
    fireEvent.change(textarea, { target: { value: "submitted" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    // Type a draft (not submitted)
    fireEvent.change(textarea, { target: { value: "my draft" } });

    // ArrowUp to history
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(textarea.value).toBe("submitted");

    // ArrowDown to restore draft
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect(textarea.value).toBe("my draft");
  });

  it("persists history to sessionStorage", async () => {
    const { container } = render(
      <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
    );
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "stored prompt" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    const stored = sessionStorage.getItem("promptHistory");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain("stored prompt");
  });

  it("limits history to 50 entries", async () => {
    // Pre-fill sessionStorage with 50 items
    const existing = Array.from({ length: 50 }, (_, i) => `prompt-${i}`);
    sessionStorage.setItem("promptHistory", JSON.stringify(existing));

    const { container } = render(
      <PromptInput activeSessionId="sess-1" sessionCwd="/tmp" />
    );
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "prompt-50" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    const stored = JSON.parse(sessionStorage.getItem("promptHistory")!);
    expect(stored.length).toBe(50);
    // Most recent should be at end
    expect(stored[stored.length - 1]).toBe("prompt-50");
    // Oldest should have been dropped
    expect(stored[0]).toBe("prompt-1");
  });
});
