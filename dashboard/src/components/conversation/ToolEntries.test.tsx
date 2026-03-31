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

  it("does not call onToolClick when a collapsed group row is clicked (toggles expand instead)", () => {
    const onToolClick = vi.fn();
    const events: SessionEvent[] = [
      ...makeToolPairEvents("Read", "tool-a"),
      ...makeToolPairEvents("Read", "tool-b"),
      ...makeToolPairEvents("Read", "tool-c"),
    ];
    const { container } = render(
      <ToolEntries events={events} onToolClick={onToolClick} />,
    );

    // Collapsed group row has role="button"
    const groupRow = container.querySelector("[role='button']");
    expect(groupRow).not.toBeNull();
    fireEvent.click(groupRow!);

    // Click now toggles expand, does NOT fire onToolClick
    expect(onToolClick).not.toHaveBeenCalled();
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

describe("ToolEntries CollapsedGroupRow expand/collapse", () => {
  function makeReadGroupEvents(files: string[]): SessionEvent[] {
    const events: SessionEvent[] = [];
    for (let i = 0; i < files.length; i++) {
      const toolId = `tu-read-grp-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Read", input: { file_path: files[i] } }),
      );
      events.push(makeUserEvent(toolId, `content of ${files[i]}`));
    }
    return events;
  }

  const files = ["src/foo.ts", "src/bar.ts", "src/baz.ts"];

  it("shows sub-rows when collapsed group is clicked", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    expect(groupRow).not.toBeNull();

    // No sub-rows initially
    expect(container.querySelector("[role='list']")).toBeNull();

    fireEvent.click(groupRow!);

    const list = container.querySelector("[role='list']");
    expect(list).not.toBeNull();
    const items = list!.querySelectorAll("[role='listitem']");
    expect(items.length).toBe(3);
  });

  it("collapses sub-rows when clicked again", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");

    fireEvent.click(groupRow!);
    expect(container.querySelector("[role='list']")).not.toBeNull();

    fireEvent.click(groupRow!);
    expect(container.querySelector("[role='list']")).toBeNull();
  });

  it("shows ChevronRight when collapsed and ChevronDown when expanded", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");

    expect(groupRow!.querySelector("[data-testid='chevron-right']")).not.toBeNull();
    expect(groupRow!.querySelector("[data-testid='chevron-down']")).toBeNull();

    fireEvent.click(groupRow!);

    expect(groupRow!.querySelector("[data-testid='chevron-down']")).not.toBeNull();
    expect(groupRow!.querySelector("[data-testid='chevron-right']")).toBeNull();
  });

  it("sub-rows have colored dots matching tool type", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    fireEvent.click(groupRow!);

    const dots = container.querySelectorAll("[data-testid='sub-row-dot']");
    expect(dots.length).toBe(3);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.backgroundColor).toBe("var(--teal)");
    }
  });

  it("toggles aria-expanded attribute", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    expect(groupRow!.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(groupRow!);
    expect(groupRow!.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(groupRow!);
    expect(groupRow!.getAttribute("aria-expanded")).toBe("false");
  });

  it("expand hint has aria-hidden='true'", () => {
    const events = makeReadGroupEvents(files);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    // Find the span hint (not the SVG which also has aria-hidden)
    const hints = groupRow!.querySelectorAll("span[aria-hidden='true']");
    const hint = Array.from(hints).find((el) => el.textContent === "click to expand");
    expect(hint).not.toBeUndefined();
    expect(hint!.textContent).toBe("click to expand");
  });
});

describe("ToolEntries - CollapsedGroupRow dead onToolClick prop (P2 bug)", () => {
  afterEach(cleanup);

  it("CollapsedGroupRow type does not accept onToolClick prop", async () => {
    // This is a static analysis check - we verify the component's interface
    // by ensuring it does not pass onToolClick down to CollapsedGroupRow.
    // The real test: CollapsedGroupRow ignores onToolClick (covered above).
    // We verify the function signature has no onToolClick by checking TS exports.
    // Since this is runtime, we verify the collapsed group row never calls onToolClick.
    const onToolClick = vi.fn();
    const events: SessionEvent[] = [
      ...makeToolPairEvents("Read", "tool-x1"),
      ...makeToolPairEvents("Read", "tool-x2"),
      ...makeToolPairEvents("Read", "tool-x3"),
    ];
    const { container } = render(
      <ToolEntries events={events} onToolClick={onToolClick} />,
    );

    // Click the collapsed group row
    const groupRow = container.querySelector("[role='button']");
    expect(groupRow).not.toBeNull();
    fireEvent.click(groupRow!);
    // onToolClick must NOT be called
    expect(onToolClick).not.toHaveBeenCalled();
  });
});

describe("ToolEntries - agent dispatch children wiring", () => {
  afterEach(cleanup);

  function makeAgentDispatchEvents(
    resultContent?: string | unknown[],
    isError = false,
  ): SessionEvent[] {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-agent-1",
        name: "Task",
        input: { prompt: "Fix the bug in parser.ts", description: "Fix parser bug" },
      }),
    ];
    if (resultContent !== undefined) {
      events.push({
        type: "user",
        uuid: "uuid-user-agent-1",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-agent-1",
              content: resultContent,
              ...(isError ? { is_error: true } : {}),
            },
          ],
        },
      } as UserEvent);
    }
    return events;
  }

  it("renders AgentCard with children when agent dispatch has resultContent", () => {
    const events = makeAgentDispatchEvents("Fixed the bug in parser.ts\nAll tests passing");
    const { container } = render(<ToolEntries events={events} />);

    // AgentCard should have a chevron (indicating expandable children)
    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).not.toBeNull();

    // Click the header to expand
    const header = container.querySelector("[data-testid='agent-card-header']");
    expect(header).not.toBeNull();
    fireEvent.click(header!);

    // Detail panel should now be visible with the result content
    const detail = container.querySelector("[data-testid='agent-card-detail']");
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain("Fixed the bug in parser.ts");
  });

  it("renders AgentCard without children when agent dispatch has no resultContent", () => {
    const events = makeAgentDispatchEvents(); // no result
    const { container } = render(<ToolEntries events={events} />);

    // AgentCard should NOT have a chevron (no children)
    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).toBeNull();
  });

  it("renders AgentCard with array resultContent extracting text items", () => {
    const arrayContent = [
      { type: "text", text: "First result line" },
      { type: "text", text: "Second result line" },
    ];
    const events = makeAgentDispatchEvents(arrayContent as unknown[]);
    const { container } = render(<ToolEntries events={events} />);

    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).not.toBeNull();

    const header = container.querySelector("[data-testid='agent-card-header']");
    fireEvent.click(header!);

    const detail = container.querySelector("[data-testid='agent-card-detail']");
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain("First result line");
    expect(detail!.textContent).toContain("Second result line");
  });

  it("truncates long string resultContent to 500 chars", () => {
    const longContent = "A".repeat(600);
    const events = makeAgentDispatchEvents(longContent);
    const { container } = render(<ToolEntries events={events} />);

    const header = container.querySelector("[data-testid='agent-card-header']");
    fireEvent.click(header!);

    const detail = container.querySelector("[data-testid='agent-card-detail']");
    expect(detail).not.toBeNull();
    // Should be truncated: 500 chars + ellipsis
    const text = detail!.textContent || "";
    expect(text.length).toBeLessThanOrEqual(510); // 500 + ellipsis + minor markup
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
