import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PermissionBlock } from "./PermissionBlock";
import type { PermissionRequest } from "../../lib/types";

afterEach(cleanup);

function makePermission(
  overrides: Partial<PermissionRequest> = {}
): PermissionRequest {
  return {
    id: "perm-1",
    sessionId: "sess-1",
    agentId: "agent-1",
    toolName: "Write",
    input: { file_path: "/src/foo.ts" },
    timestamp: "2026-01-01T00:00:00Z",
    status: "pending",
    ...overrides,
  };
}

describe("PermissionBlock", () => {
  it("renders tool name and file path for a pending permission", () => {
    const { getByText } = render(
      <PermissionBlock permission={makePermission()} onDecide={vi.fn()} />
    );

    expect(getByText("Permission Required")).toBeTruthy();
    expect(getByText("Write")).toBeTruthy();
    expect(getByText("/src/foo.ts")).toBeTruthy();
  });

  it("clicking Allow calls onDecide with 'approved'", () => {
    const onDecide = vi.fn();
    const { getAllByLabelText } = render(
      <PermissionBlock permission={makePermission()} onDecide={onDecide} />
    );

    const buttons = getAllByLabelText("Approve permission for Write");
    fireEvent.click(buttons[0]);

    expect(onDecide).toHaveBeenCalledWith("perm-1", "approved");
  });

  it("clicking Deny calls onDecide with 'denied'", () => {
    const onDecide = vi.fn();
    const { getAllByLabelText } = render(
      <PermissionBlock permission={makePermission()} onDecide={onDecide} />
    );

    const buttons = getAllByLabelText("Deny permission for Write");
    fireEvent.click(buttons[0]);

    expect(onDecide).toHaveBeenCalledWith("perm-1", "denied");
  });

  it("renders approved status text when status is 'approved'", () => {
    const { container } = render(
      <PermissionBlock
        permission={makePermission({ status: "approved" })}
        onDecide={vi.fn()}
      />
    );

    // Should not show buttons
    expect(container.querySelector("button")).toBeNull();
    // Should show approved indicator
    expect(container.textContent).toContain("Approved");
  });

  it("renders denied status text when status is 'denied'", () => {
    const { container } = render(
      <PermissionBlock
        permission={makePermission({ status: "denied" })}
        onDecide={vi.fn()}
      />
    );

    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("Denied");
  });

  it("shows command for Bash tool", () => {
    const perm = makePermission({
      toolName: "Bash",
      input: { command: "ls -la /tmp" },
    });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );

    expect(container.textContent).toContain("ls -la /tmp");
  });

  it("shows file path and content preview for Write tool", () => {
    const perm = makePermission({
      toolName: "Write",
      input: {
        file_path: "/src/foo.ts",
        content: "export function hello() { return 'world'; }",
      },
    });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );

    expect(container.textContent).toContain("/src/foo.ts");
    expect(container.textContent).toContain("export function hello()");
  });

  it("shows file path and old/new string preview for Edit tool", () => {
    const perm = makePermission({
      toolName: "Edit",
      input: {
        file_path: "/src/bar.ts",
        old_string: "const x = 1;",
        new_string: "const x = 2;",
      },
    });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );

    expect(container.textContent).toContain("/src/bar.ts");
    expect(container.textContent).toContain("const x = 1;");
    expect(container.textContent).toContain("const x = 2;");
  });

  it("shows all input parameters for generic tools", () => {
    const perm = makePermission({
      toolName: "mcp__server__tool",
      input: { query: "test query", limit: 10 },
    });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );

    expect(container.textContent).toContain("query");
    expect(container.textContent).toContain("test query");
    expect(container.textContent).toContain("limit");
  });

  it("shows 'Allow for session' button when onDecideSession is provided", () => {
    const onDecideSession = vi.fn();
    const { getByText } = render(
      <PermissionBlock
        permission={makePermission()}
        onDecide={vi.fn()}
        onDecideSession={onDecideSession}
      />
    );

    const btn = getByText("Allow for session");
    fireEvent.click(btn);
    expect(onDecideSession).toHaveBeenCalledWith("perm-1");
  });

  it("does not show 'Allow for session' button when onDecideSession is not provided", () => {
    const { container } = render(
      <PermissionBlock permission={makePermission()} onDecide={vi.fn()} />
    );

    expect(container.textContent).not.toContain("Allow for session");
  });

  it("shows agent ID badge in header", () => {
    const { getByTestId } = render(
      <PermissionBlock
        permission={makePermission({ agentId: "main" })}
        onDecide={vi.fn()}
      />
    );

    const badge = getByTestId("agent-id-badge");
    expect(badge.textContent).toBe("main");
  });

  it("truncates long agent IDs to 8 chars", () => {
    const { getByTestId } = render(
      <PermissionBlock
        permission={makePermission({
          agentId: "abcdefghijklmnopqrstuvwxyz",
        })}
        onDecide={vi.fn()}
      />
    );

    const badge = getByTestId("agent-id-badge");
    expect(badge.textContent).toBe("abcdefgh");
  });
});
