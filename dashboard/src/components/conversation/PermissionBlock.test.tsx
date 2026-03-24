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
});
