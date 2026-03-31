import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ToolEntries, getProgressText } from "./ToolEntries";
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

function makeToolPairEvents(
  toolName: string,
  toolId: string,
): SessionEvent[] {
  return [
    makeAssistantEvent({ id: toolId, name: toolName, input: { command: "ls" } }),
    makeUserEvent(toolId, "ok"),
  ];
}

describe("ToolEntries — onToolClick", () => {
  afterEach(cleanup);

  it("calls onToolClick when a tool entry row is clicked", () => {
    const onToolClick = vi.fn();
    const events = makeToolPairEvents("Bash", "tool-1");
    const { container } = render(
      <ToolEntries events={events} onToolClick={onToolClick} />,
    );

    const entryRow = container.querySelector(
      ".conv-tool-entries .flex.items-center.cursor-pointer",
    );
    expect(entryRow).not.toBeNull();
    fireEvent.click(entryRow!);

    expect(onToolClick).toHaveBeenCalledTimes(1);
    expect(onToolClick).toHaveBeenCalledWith("Bash");
  });

  it("calls onToolClick when a collapsed group row is clicked", () => {
    const onToolClick = vi.fn();
    const events: SessionEvent[] = [
      ...makeToolPairEvents("Read", "tool-a"),
      ...makeToolPairEvents("Read", "tool-b"),
      ...makeToolPairEvents("Read", "tool-c"),
    ];
    const { container } = render(
      <ToolEntries events={events} onToolClick={onToolClick} />,
    );

    // Collapsed group row: the first .flex.items-center in conv-tool-entries
    const groupRow = container.querySelector(
      ".conv-tool-entries .flex.items-center",
    );
    expect(groupRow).not.toBeNull();
    fireEvent.click(groupRow!);

    expect(onToolClick).toHaveBeenCalledTimes(1);
    expect(onToolClick).toHaveBeenCalledWith("Read");
  });

  it("does not error when onToolClick is not provided", () => {
    const events = makeToolPairEvents("Bash", "tool-1");
    const { container } = render(<ToolEntries events={events} />);
    const entryRow = container.querySelector(
      ".conv-tool-entries .flex.items-center.cursor-pointer",
    );
    expect(entryRow).not.toBeNull();
    // Should not throw
    fireEvent.click(entryRow!);
  });
});

describe("ToolEntries — colored borders and semantic summaries", () => {
  afterEach(cleanup);

  it("renders teal border for Read tools", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-read", name: "Read", input: { file_path: "src/lib/types.ts" } }),
      makeUserEvent("tu-read", "file contents here"),
    ];
    const { container } = render(<ToolEntries events={events} />);
    const row = container.querySelector(".conv-tool-entries .flex.items-center.cursor-pointer") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.style.borderLeft).toBe("3px solid var(--teal)");
  });

  it("renders red border for error status", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-read-err", name: "Read", input: { file_path: "missing.ts" } }),
      {
        type: "user",
        uuid: "uuid-user-err",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-read-err",
              content: "file not found",
              is_error: true,
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);
    const row = container.querySelector(".conv-tool-entries .flex.items-center.cursor-pointer") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.style.borderLeft).toBe("3px solid var(--red)");
  });

  it("shows 'Read 6 files' for grouped reads", () => {
    const events: SessionEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(
        makeAssistantEvent({ id: `tu-read-${i}`, name: "Read", input: { file_path: `file${i}.ts` } }),
      );
      events.push(makeUserEvent(`tu-read-${i}`, `content ${i}`));
    }
    const { container } = render(<ToolEntries events={events} />);
    const groupText = container.querySelector(".conv-tool-entries")?.textContent;
    expect(groupText).toContain("Read 6 files");
  });

  it("shows Grep with quoted pattern", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-grep", name: "Grep", input: { pattern: "calculateTurnCost" } }),
      makeUserEvent("tu-grep", "matched lines"),
    ];
    const { container } = render(<ToolEntries events={events} />);
    const text = container.querySelector(".conv-tool-entries")?.textContent;
    expect(text).toContain('Grep "calculateTurnCost"');
  });
});

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

describe("getProgressText", () => {
  afterEach(cleanup);

  it("shows 'Reading...' for running Read tool", () => {
    expect(getProgressText("Read", "running")).toBe("Reading...");
  });

  it("shows 'Read' for completed Read tool", () => {
    expect(getProgressText("Read", "success")).toBe("Read");
  });

  it("shows 'Searching...' for running Grep tool", () => {
    expect(getProgressText("Grep", "running")).toBe("Searching...");
  });

  it("shows 'Searched' for completed Grep tool", () => {
    expect(getProgressText("Grep", "success")).toBe("Searched");
  });

  it("shows 'Running...' for running Bash tool", () => {
    expect(getProgressText("Bash", "running")).toBe("Running...");
  });

  it("shows 'Ran' for completed Bash tool", () => {
    expect(getProgressText("Bash", "success")).toBe("Ran");
  });

  it("shows 'Editing...' for running Edit tool", () => {
    expect(getProgressText("Edit", "running")).toBe("Editing...");
  });

  it("shows 'Edited' for completed Edit tool", () => {
    expect(getProgressText("Edit", "success")).toBe("Edited");
  });

  it("shows 'Writing...' for running Write tool", () => {
    expect(getProgressText("Write", "running")).toBe("Writing...");
  });

  it("shows 'Wrote' for completed Write tool", () => {
    expect(getProgressText("Write", "success")).toBe("Wrote");
  });

  it("shows 'Globbing...' for running Glob tool", () => {
    expect(getProgressText("Glob", "running")).toBe("Globbing...");
  });

  it("shows 'Dispatching...' for running Task tool", () => {
    expect(getProgressText("Task", "running")).toBe("Dispatching...");
  });

  it("shows tool name for completed unknown tool", () => {
    expect(getProgressText("CustomTool", "success")).toBe("CustomTool");
  });

  it("shows 'Running...' for running unknown tool", () => {
    expect(getProgressText("CustomTool", "running")).toBe("Running...");
  });
});

describe("ToolEntries - progress text in rendered output", () => {
  afterEach(cleanup);

  it("renders 'Reading...' text for a running Read tool", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-prog-1", name: "Read", input: { file_path: "src/index.ts" } }),
      // No result event => status stays "running"
    ];
    const { container } = render(<ToolEntries events={events} />);
    const text = container.querySelector(".conv-tool-entries")?.textContent;
    expect(text).toContain("Reading...");
  });

  it("renders 'Read' progress text for a completed Read tool", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-prog-2", name: "Read", input: { file_path: "src/index.ts" } }),
      makeUserEvent("tu-prog-2", "file contents here"),
    ];
    const { container } = render(<ToolEntries events={events} />);
    const text = container.querySelector(".conv-tool-entries")?.textContent;
    // Progress text "Read" appears alongside the semantic summary
    expect(text).toContain("Read");
    expect(text).toContain("src/index.ts");
  });
});

describe("ToolEntries - expand/collapse long output", () => {
  afterEach(cleanup);

  it("shows '+N lines' button for long output", () => {
    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-exp-1", name: "Read", input: { file_path: "src/big.ts" } }),
      {
        type: "user",
        uuid: "uuid-user-exp-1",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-exp-1",
              content: longContent,
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);
    const btnText = container.textContent;
    // ToolResultBlock should show "+7 lines (click to expand)"
    expect(btnText).toContain("+7 lines");
  });

  it("expands output on click and shows collapse button", () => {
    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const events: SessionEvent[] = [
      makeAssistantEvent({ id: "tu-exp-2", name: "Read", input: { file_path: "src/big.ts" } }),
      {
        type: "user",
        uuid: "uuid-user-exp-2",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-exp-2",
              content: longContent,
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);
    // Find the expand button
    const buttons = container.querySelectorAll("button");
    const expandBtn = Array.from(buttons).find((b) => b.textContent?.includes("+7 lines"));
    expect(expandBtn).not.toBeUndefined();
    fireEvent.click(expandBtn!);
    // After expanding, all 10 lines should be visible
    expect(container.textContent).toContain("line 10");
    // And a collapse button should appear
    expect(container.textContent).toContain("Collapse");
  });
});
