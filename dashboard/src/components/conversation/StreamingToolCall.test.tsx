import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { StreamingToolCall } from "./StreamingToolCall";
import type { StreamingToolEntry } from "../../lib/streaming-types";

afterEach(cleanup);

function makeEntry(overrides: Partial<StreamingToolEntry> = {}): StreamingToolEntry {
  return {
    id: "toolu_123",
    name: "Read",
    input: { file_path: "/src/App.tsx" },
    inputJson: '{"file_path":"/src/App.tsx"}',
    status: "running",
    startedAt: Date.now(),
    ...overrides,
  };
}

describe("StreamingToolCall", () => {
  it("renders tool name badge", () => {
    const { container } = render(<StreamingToolCall entry={makeEntry()} />);
    expect(container.textContent).toContain("Read");
  });

  it("renders target path from input", () => {
    const { container } = render(<StreamingToolCall entry={makeEntry()} />);
    expect(container.textContent).toContain("/src/App.tsx");
  });

  it("shows spinner when status is running", () => {
    const { container } = render(<StreamingToolCall entry={makeEntry({ status: "running" })} />);
    const spinner = container.querySelector("[data-testid='tool-spinner']");
    expect(spinner).not.toBeNull();
  });

  it("shows checkmark when status is success", () => {
    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({ status: "success", resultContent: "file content", completedAt: Date.now() })}
      />
    );
    expect(container.textContent).toContain("\u2713");
  });

  it("shows X when status is error", () => {
    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({ status: "error", resultContent: "Error: not found", resultIsError: true, completedAt: Date.now() })}
      />
    );
    expect(container.textContent).toContain("\u2717");
  });

  it("shows elapsed time", () => {
    const entry = makeEntry({ startedAt: Date.now() - 2300 });
    const { container } = render(<StreamingToolCall entry={entry} />);
    // Should show some elapsed time text (component uses internal timer)
    // Just verify the timer element exists
    const timer = container.querySelector("[data-testid='elapsed-timer']");
    expect(timer).not.toBeNull();
  });

  it("renders result content when complete (collapsed by default for success)", () => {
    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({
          status: "success",
          resultContent: "line 1\nline 2\nline 3",
          completedAt: Date.now(),
        })}
      />
    );
    // Result area should exist
    const resultArea = container.querySelector("[data-testid='tool-result-area']");
    expect(resultArea).not.toBeNull();
  });

  it("expands error result by default", () => {
    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({
          status: "error",
          resultContent: "Error: file not found",
          resultIsError: true,
          completedAt: Date.now(),
        })}
      />
    );
    const resultArea = container.querySelector("[data-testid='tool-result-area']");
    expect(resultArea).not.toBeNull();
    expect(resultArea?.textContent).toContain("Error: file not found");
  });

  it("renders with empty input gracefully", () => {
    const { container } = render(
      <StreamingToolCall entry={makeEntry({ input: {}, inputJson: "{}" })} />
    );
    expect(container.textContent).toContain("Read");
  });

  it("renders Bash command as target", () => {
    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({
          name: "Bash",
          input: { command: "ls -la /tmp" },
          inputJson: '{"command":"ls -la /tmp"}',
        })}
      />
    );
    expect(container.textContent).toContain("ls -la /tmp");
  });

  it("has accessible spinner label", () => {
    const { container } = render(<StreamingToolCall entry={makeEntry()} />);
    const spinner = container.querySelector("[data-testid='tool-spinner']");
    expect(spinner?.getAttribute("aria-label")).toBe("Tool executing");
  });
});

// NEW-5 — "Background this task" button
describe("StreamingToolCall background-task button", () => {
  it("shows the background button only while the tool is running", () => {
    const { container, rerender } = render(
      <StreamingToolCall entry={makeEntry({ status: "running" })} sessionId="sess-1" />
    );
    const btn = container.querySelector("[data-testid='background-task-btn']");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("title")).toContain("Background this task");

    rerender(
      <StreamingToolCall
        entry={makeEntry({ status: "success", resultContent: "ok", completedAt: Date.now() })}
        sessionId="sess-1"
      />
    );
    const btnAfter = container.querySelector("[data-testid='background-task-btn']");
    expect(btnAfter).toBeNull();
  });

  it("POSTs to /api/sessions/:sessionId/background-task with toolUseId on click", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const { container } = render(
      <StreamingToolCall
        entry={makeEntry({ id: "toolu_xyz", status: "running" })}
        sessionId="sess-1"
      />
    );
    const btn = container.querySelector("[data-testid='background-task-btn']");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sessions/sess-1/background-task",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolUseId: "toolu_xyz" }),
        })
      );
    });

    fetchSpy.mockRestore();
  });
});
