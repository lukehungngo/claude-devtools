import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ToolEntries, getProgressText, getToolBadgeColors, extractToolStatsFromResult, extractDurationFromResult, extractCostFromResult } from "./ToolEntries";
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

  it("toggles expand on click when tool entry has result content (collapsed by default)", () => {
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

    // Click expands the result instead of calling onToolClick when there's result content
    expect(onToolClick).not.toHaveBeenCalled();
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
  it("renders DiffBlock for Edit tool calls after expanding the row", () => {
    const events = makeEditEvents("old code", "new code", "src/foo.ts");
    const { container } = render(<ToolEntries events={events} />);
    // Collapsed by default — expand the entry row first
    const entryRow = container.querySelector(".conv-tool-entries .group");
    expect(entryRow).not.toBeNull();
    fireEvent.click(entryRow!);
    const diffBlock = container.querySelector("[data-testid='diff-block']");
    expect(diffBlock).not.toBeNull();
    expect(diffBlock!.textContent).toContain("src/foo.ts");
    expect(diffBlock!.textContent).toContain("Show diff");
  });

  it("shows removed and added lines when Edit diff is expanded", () => {
    const events = makeEditEvents("old line", "new line", "src/bar.ts");
    const { container, getByText } = render(<ToolEntries events={events} />);
    // Expand the entry row first
    const entryRow = container.querySelector(".conv-tool-entries .group");
    fireEvent.click(entryRow!);
    fireEvent.click(getByText("Show diff"));
    const removed = container.querySelector("[data-testid='diff-removed']");
    const added = container.querySelector("[data-testid='diff-added']");
    expect(removed).not.toBeNull();
    expect(removed!.textContent).toContain("old line");
    expect(added).not.toBeNull();
    expect(added!.textContent).toContain("new line");
  });

  it("renders DiffBlock for Write tool calls after expanding the row", () => {
    const events = makeWriteEvents("written content\nline 2", "src/new.ts");
    const { container, getByText } = render(<ToolEntries events={events} />);
    // Expand the entry row first
    const entryRow = container.querySelector(".conv-tool-entries .group");
    fireEvent.click(entryRow!);
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

    // AgentCard always shows chevron (PhaseGroup pattern)
    const chevron = container.querySelector("[data-testid='agent-card-chevron']");
    expect(chevron).not.toBeNull();

    // But no detail panel should be visible even if expanded (no children to show)
    const detail = container.querySelector("[data-testid='agent-card-detail']");
    expect(detail).toBeNull();
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

describe("getToolBadgeColors", () => {
  it("returns teal colors for Read", () => {
    expect(getToolBadgeColors("Read")).toEqual({ bg: "var(--teal-dim)", text: "var(--teal)" });
  });

  it("returns teal colors for glob", () => {
    expect(getToolBadgeColors("glob")).toEqual({ bg: "var(--teal-dim)", text: "var(--teal)" });
  });

  it("returns teal colors for listdir", () => {
    expect(getToolBadgeColors("listdir")).toEqual({ bg: "var(--teal-dim)", text: "var(--teal)" });
  });

  it("returns accent colors for grep", () => {
    expect(getToolBadgeColors("grep")).toEqual({ bg: "var(--accent-dim)", text: "var(--accent)" });
  });

  it("returns accent colors for websearch", () => {
    expect(getToolBadgeColors("websearch")).toEqual({ bg: "var(--accent-dim)", text: "var(--accent)" });
  });

  it("returns yellow colors for bash", () => {
    expect(getToolBadgeColors("bash")).toEqual({ bg: "var(--yellow-dim)", text: "var(--yellow)" });
  });

  it("returns green colors for edit", () => {
    expect(getToolBadgeColors("edit")).toEqual({ bg: "var(--green-dim)", text: "var(--green)" });
  });

  it("returns green colors for Write", () => {
    expect(getToolBadgeColors("Write")).toEqual({ bg: "var(--green-dim)", text: "var(--green)" });
  });

  it("returns default colors for unknown tool", () => {
    expect(getToolBadgeColors("CustomTool")).toEqual({ bg: "var(--bg-h)", text: "var(--t3)" });
  });
});

describe("ToolEntries - CollapsedGroupRow badge colors", () => {
  afterEach(cleanup);

  function makeReadGroupEvents(files: string[]): SessionEvent[] {
    const events: SessionEvent[] = [];
    for (let i = 0; i < files.length; i++) {
      const toolId = `tu-badge-read-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Read", input: { file_path: files[i] } }),
      );
      events.push(makeUserEvent(toolId, `content of ${files[i]}`));
    }
    return events;
  }

  it("renders teal badge colors for a Read collapsed group", () => {
    const events = makeReadGroupEvents(["a.ts", "b.ts", "c.ts"]);
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    expect(groupRow).not.toBeNull();

    // The count badge is the span with font-size 9px containing "3"
    const spans = groupRow!.querySelectorAll("span.font-mono");
    const badge = Array.from(spans).find((s) => s.textContent === "3") as HTMLElement | undefined;
    expect(badge).not.toBeUndefined();
    expect(badge!.style.background).toBe("var(--teal-dim)");
    expect(badge!.style.color).toBe("var(--teal)");
  });

  it("renders accent badge colors for a Grep collapsed group", () => {
    const events: SessionEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const toolId = `tu-badge-grep-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Grep", input: { pattern: `pattern${i}` } }),
      );
      events.push(makeUserEvent(toolId, "matches"));
    }
    const { container } = render(<ToolEntries events={events} />);

    const groupRow = container.querySelector("[role='button']");
    const spans = groupRow!.querySelectorAll("span.font-mono");
    const badge = Array.from(spans).find((s) => s.textContent === "3") as HTMLElement | undefined;
    expect(badge).not.toBeUndefined();
    expect(badge!.style.background).toBe("var(--accent-dim)");
    expect(badge!.style.color).toBe("var(--accent)");
  });
});

describe("extractToolStatsFromResult", () => {
  it("parses 'Read ×11\\nGrep ×6' format", () => {
    const result = extractToolStatsFromResult("Read ×11\nGrep ×6");
    expect(result).toEqual([
      { name: "Read", count: 11 },
      { name: "Grep", count: 6 },
    ]);
  });

  it("parses 'Read x11\\nGrep x6' format (lowercase x)", () => {
    const result = extractToolStatsFromResult("Read x11\nGrep x6");
    expect(result).toEqual([
      { name: "Read", count: 11 },
      { name: "Grep", count: 6 },
    ]);
  });

  it("parses 'Edit ×3' from array of content blocks", () => {
    const content = [
      { type: "text", text: "Edit ×3\nBash ×2" },
    ];
    const result = extractToolStatsFromResult(content as unknown[]);
    expect(result).toEqual([
      { name: "Edit", count: 3 },
      { name: "Bash", count: 2 },
    ]);
  });

  it("returns empty array for unparseable content", () => {
    const result = extractToolStatsFromResult("No tool stats here, just a normal response.");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractToolStatsFromResult("")).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(extractToolStatsFromResult([])).toEqual([]);
  });

  it("handles mixed content blocks extracting text only", () => {
    const content = [
      { type: "image", source: {} },
      { type: "text", text: "Write ×5" },
    ];
    const result = extractToolStatsFromResult(content as unknown[]);
    expect(result).toEqual([{ name: "Write", count: 5 }]);
  });
});

describe("ToolEntries - agent dispatch with toolStats wiring", () => {
  afterEach(cleanup);

  it("renders AgentCard with tool stat badges when resultContent has parseable stats", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-agent-stats",
        name: "Task",
        input: { prompt: "Refactor utils", description: "Refactor utils" },
      }),
      {
        type: "user",
        uuid: "uuid-user-agent-stats",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-agent-stats",
              content: "Read ×11\nGrep ×6\nEdit ×3",
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);
    const badges = container.querySelectorAll("[data-testid='agent-stat-badge']");
    expect(badges.length).toBe(3);
    expect(badges[0].textContent).toContain("Read");
    expect(badges[0].textContent).toContain("11");
    expect(badges[1].textContent).toContain("Grep");
    expect(badges[1].textContent).toContain("6");
    expect(badges[2].textContent).toContain("Edit");
    expect(badges[2].textContent).toContain("3");
  });

  it("renders AgentCard without stat badges when resultContent has no parseable stats", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-agent-nostats",
        name: "Task",
        input: { prompt: "Simple task", description: "Simple task" },
      }),
      {
        type: "user",
        uuid: "uuid-user-agent-nostats",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-agent-nostats",
              content: "Task completed successfully. All changes applied.",
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);
    const badges = container.querySelectorAll("[data-testid='agent-stat-badge']");
    expect(badges.length).toBe(0);
  });
});

describe("ToolEntries - expand/collapse long output", () => {
  afterEach(cleanup);

  it("shows '+N lines' button for long output after expanding the entry row", () => {
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
    // Result is collapsed by default — expand the entry row first
    const entryRow = container.querySelector(".conv-tool-entries .group");
    fireEvent.click(entryRow!);
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
    // Expand entry row first
    const entryRow = container.querySelector(".conv-tool-entries .group");
    fireEvent.click(entryRow!);
    // Find the expand button inside ToolResultBlock
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

describe("ToolEntries — PhaseGroup wrapping (Level 2)", () => {
  afterEach(cleanup);

  /**
   * Create events for a sequence of tool calls targeting overlapping files,
   * split into two disjoint file-sets so groupIntoPhases produces 2 phases.
   */
  function makeOverlappingPhaseEvents(): SessionEvent[] {
    const events: SessionEvent[] = [];
    // Phase 1: Grep + Read 3 files in src/lib/
    events.push(
      makeAssistantEvent({ id: "ph-grep-1", name: "Grep", input: { pattern: "computeMetrics", file_path: "src/lib/metrics.ts" } }),
    );
    events.push(makeUserEvent("ph-grep-1", "matches"));
    for (let i = 0; i < 3; i++) {
      const toolId = `ph-read-1-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Read", input: { file_path: `src/lib/file${i}.ts` } }),
      );
      events.push(makeUserEvent(toolId, `content ${i}`));
    }
    for (let i = 0; i < 3; i++) {
      const toolId = `ph-edit-1-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Edit", input: { file_path: `src/lib/file${i}.ts`, old_string: "old", new_string: "new" } }),
      );
      events.push(makeUserEvent(toolId, "OK"));
    }

    // Phase 2: completely disjoint file-set in test/
    events.push(
      makeAssistantEvent({ id: "ph-grep-2", name: "Grep", input: { pattern: "describe", file_path: "test/metrics.test.ts" } }),
    );
    events.push(makeUserEvent("ph-grep-2", "matches"));
    for (let i = 0; i < 3; i++) {
      const toolId = `ph-read-2-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Read", input: { file_path: `test/file${i}.test.ts` } }),
      );
      events.push(makeUserEvent(toolId, `test content ${i}`));
    }

    return events;
  }

  it("wraps multi-group phases in PhaseGroup wrapper", () => {
    const events = makeOverlappingPhaseEvents();
    const { container } = render(<ToolEntries events={events} />);

    const phaseGroups = container.querySelectorAll("[data-testid='phase-group']");
    expect(phaseGroups.length).toBeGreaterThanOrEqual(1);

    // Each phase-group should have a phase-head with a label
    const phaseHeads = container.querySelectorAll("[data-testid='phase-head']");
    expect(phaseHeads.length).toBeGreaterThanOrEqual(1);
  });

  it("single-group phases render without PhaseGroup wrapper", () => {
    // Just 2 Reads — forms a single group, single phase => no PhaseGroup
    const events: SessionEvent[] = [];
    for (let i = 0; i < 2; i++) {
      const toolId = `ph-single-${i}`;
      events.push(
        makeAssistantEvent({ id: toolId, name: "Read", input: { file_path: `src/single${i}.ts` } }),
      );
      events.push(makeUserEvent(toolId, `content ${i}`));
    }
    const { container } = render(<ToolEntries events={events} />);

    const phaseGroups = container.querySelectorAll("[data-testid='phase-group']");
    expect(phaseGroups.length).toBe(0);
  });

  it("PhaseGroup pill badges show tool counts", () => {
    const events = makeOverlappingPhaseEvents();
    const { container } = render(<ToolEntries events={events} />);

    const pills = container.querySelectorAll("[data-testid='phase-pill']");
    // At least one phase should have pill badges
    expect(pills.length).toBeGreaterThanOrEqual(1);
  });
});

describe("extractDurationFromResult", () => {
  it("parses 'duration_ms: 152027' from string content", () => {
    const result = extractDurationFromResult("Task completed.\nduration_ms: 152027\nnum_turns: 5");
    expect(result).toBe(152027);
  });

  it("parses duration_ms from array content blocks", () => {
    const content = [
      { type: "text", text: "All done.\nduration_ms: 5000" },
    ];
    const result = extractDurationFromResult(content as unknown[]);
    expect(result).toBe(5000);
  });

  it("returns undefined when no duration pattern found", () => {
    expect(extractDurationFromResult("Just a normal result")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractDurationFromResult("")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractDurationFromResult([])).toBeUndefined();
  });
});

describe("extractCostFromResult", () => {
  it("parses 'total_cost_usd: 0.05' from string content", () => {
    const result = extractCostFromResult("Task completed.\ntotal_cost_usd: 0.05\nduration_ms: 12000");
    expect(result).toBe(0.05);
  });

  it("parses total_cost_usd from array content blocks", () => {
    const content = [
      { type: "text", text: "Done.\ntotal_cost_usd: 0.123" },
    ];
    const result = extractCostFromResult(content as unknown[]);
    expect(result).toBe(0.123);
  });

  it("returns undefined when no cost pattern found", () => {
    expect(extractCostFromResult("Just a normal result")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractCostFromResult("")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractCostFromResult([])).toBeUndefined();
  });
});

describe("ToolEntries - AgentCard cost/duration wiring", () => {
  afterEach(cleanup);

  it("passes durationMs and cost to AgentCard when result contains patterns", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-agent-dur",
        name: "Task",
        input: { prompt: "Fix bug", description: "Fix bug" },
      }),
      {
        type: "user",
        uuid: "uuid-user-agent-dur",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-agent-dur",
              content: "Task completed.\nduration_ms: 152027\ntotal_cost_usd: 0.05\nRead ×11",
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);

    // AgentCard should render duration (data-testid="agent-duration")
    const duration = container.querySelector("[data-testid='agent-duration']");
    expect(duration).not.toBeNull();
    expect(duration!.textContent).toContain("2m"); // 152027ms ~ 2.5m

    // AgentCard should render cost (data-testid="agent-cost")
    const cost = container.querySelector("[data-testid='agent-cost']");
    expect(cost).not.toBeNull();
    expect(cost!.textContent).toContain("$0.050");
  });

  it("does not render duration/cost when result has no patterns", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        id: "tu-agent-nodur",
        name: "Task",
        input: { prompt: "Simple task", description: "Simple task" },
      }),
      {
        type: "user",
        uuid: "uuid-user-agent-nodur",
        sessionId: "sess-1",
        timestamp: "2026-01-01T00:00:01Z",
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-agent-nodur",
              content: "Task completed successfully.",
            },
          ],
        },
      } as UserEvent,
    ];
    const { container } = render(<ToolEntries events={events} />);

    const duration = container.querySelector("[data-testid='agent-duration']");
    expect(duration).toBeNull();

    const cost = container.querySelector("[data-testid='agent-cost']");
    expect(cost).toBeNull();
  });
});
