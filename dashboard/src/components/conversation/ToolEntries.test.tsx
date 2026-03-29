import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ToolEntries } from "./ToolEntries";
import type { SessionEvent, AssistantEvent, UserEvent } from "../../lib/types";

afterEach(cleanup);

function makeAssistantEvent(toolUse: {
  id: string;
  name: string;
  input: Record<string, unknown>;
}): AssistantEvent {
  return {
    type: "assistant",
    uuid: "uuid-asst-1",
    sessionId: "sess-1",
    timestamp: "2026-01-01T00:00:00Z",
    message: {
      id: "msg-1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-20250514",
      content: [
        {
          type: "tool_use",
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  };
}

function makeUserEvent(toolUseId: string, resultContent: string): UserEvent {
  return {
    type: "user",
    uuid: "uuid-user-1",
    sessionId: "sess-1",
    timestamp: "2026-01-01T00:00:01Z",
    userType: "external",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: resultContent,
        },
      ],
    },
  };
}

function makeEditEvents(
  oldString: string,
  newString: string,
  filePath: string
): SessionEvent[] {
  return [
    makeAssistantEvent({
      id: "tu-edit",
      name: "Edit",
      input: { file_path: filePath, old_string: oldString, new_string: newString },
    }),
    makeUserEvent("tu-edit", "OK"),
  ];
}

function makeWriteEvents(content: string, filePath: string): SessionEvent[] {
  return [
    makeAssistantEvent({
      id: "tu-write",
      name: "Write",
      input: { file_path: filePath, content },
    }),
    makeUserEvent("tu-write", "File written successfully"),
  ];
}

describe("ToolEntries with DiffBlock", () => {
  it("renders DiffBlock for Edit tool calls", () => {
    const events = makeEditEvents("old code", "new code", "src/foo.ts");
    const { container } = render(<ToolEntries events={events} />);
    const diffBlock = container.querySelector("[data-testid='diff-block']");
    expect(diffBlock).not.toBeNull();
    expect(diffBlock!.textContent).toContain("src/foo.ts");
    expect(diffBlock!.textContent).toContain("Show diff");
  });

  it("shows removed and added lines when Edit diff is expanded", () => {
    const events = makeEditEvents("old line", "new line", "src/bar.ts");
    const { container, getByText } = render(<ToolEntries events={events} />);
    fireEvent.click(getByText("Show diff"));
    const removed = container.querySelector("[data-testid='diff-removed']");
    const added = container.querySelector("[data-testid='diff-added']");
    expect(removed).not.toBeNull();
    expect(removed!.textContent).toContain("old line");
    expect(added).not.toBeNull();
    expect(added!.textContent).toContain("new line");
  });

  it("renders DiffBlock for Write tool calls (all added lines)", () => {
    const events = makeWriteEvents("written content\nline 2", "src/new.ts");
    const { container, getByText } = render(<ToolEntries events={events} />);
    const diffBlock = container.querySelector("[data-testid='diff-block']");
    expect(diffBlock).not.toBeNull();
    fireEvent.click(getByText("Show diff"));
    const added = container.querySelectorAll("[data-testid='diff-added']");
    expect(added.length).toBe(2);
    expect(added[0].textContent).toContain("written content");
    const removed = container.querySelectorAll("[data-testid='diff-removed']");
    expect(removed.length).toBe(0);
  });

  it("does not render DiffBlock for non-Edit/Write tools", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-bash",
        name: "Bash",
        input: { command: "ls" },
      }),
    ];
    const { container } = render(<ToolEntries events={events} />);
    const diffBlock = container.querySelector("[data-testid='diff-block']");
    expect(diffBlock).toBeNull();
  });
});
