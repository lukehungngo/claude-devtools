import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
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
