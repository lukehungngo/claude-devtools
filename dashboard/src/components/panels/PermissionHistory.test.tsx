import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PermissionHistory } from "./PermissionHistory";
import type { PermissionRequest } from "../../lib/types";

function makePermission(overrides?: Partial<PermissionRequest>): PermissionRequest {
  return {
    id: "p1",
    sessionId: "s1",
    agentId: "a1",
    toolName: "Bash",
    input: { command: "ls -la" },
    timestamp: new Date().toISOString(),
    status: "approved",
    ...overrides,
  };
}

describe("PermissionHistory", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders permission entries with tool names visible", () => {
    const permissions = [
      makePermission({ id: "p1", toolName: "Bash", status: "approved" }),
      makePermission({ id: "p2", toolName: "Write", status: "denied", input: { file_path: "/src/index.ts" } }),
      makePermission({ id: "p3", toolName: "Bash", status: "pending", input: { command: "npm test" } }),
    ];
    render(<PermissionHistory permissions={permissions} />);

    // Tool names should be visible in the history
    const bashElements = screen.getAllByText("Bash");
    expect(bashElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Write").length).toBeGreaterThanOrEqual(1);
  });

  it("shows status badges (approved, denied, pending text)", () => {
    const permissions = [
      makePermission({ id: "p1", status: "approved" }),
      makePermission({ id: "p2", status: "denied" }),
      makePermission({ id: "p3", status: "pending" }),
    ];
    render(<PermissionHistory permissions={permissions} />);

    expect(screen.getAllByText("approved").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("denied").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("pending").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no permissions", () => {
    render(<PermissionHistory permissions={[]} />);
    expect(screen.getByText("No permission requests yet")).toBeTruthy();
  });

  it("shows Tool Analytics heading", () => {
    const permissions = [makePermission()];
    render(<PermissionHistory permissions={permissions} />);
    expect(screen.getByText("Tool Analytics")).toBeTruthy();
  });

  // Batch select tests
  describe("batch selection (onDecide provided)", () => {
    it("renders checkboxes only on pending rows, not resolved rows", () => {
      const permissions = [
        makePermission({ id: "pending1", toolName: "Bash", status: "pending" }),
        makePermission({ id: "pending2", toolName: "Write", status: "pending" }),
        makePermission({ id: "approved1", toolName: "Read", status: "approved" }),
        makePermission({ id: "denied1", toolName: "Edit", status: "denied" }),
      ];
      const onDecide = vi.fn();
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      // Should have exactly 2 checkboxes (for the 2 pending rows)
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(2);
    });

    it("does not render checkboxes when onDecide is not provided", () => {
      const permissions = [
        makePermission({ id: "p1", status: "pending" }),
        makePermission({ id: "p2", status: "approved" }),
      ];
      render(<PermissionHistory permissions={permissions} />);

      const checkboxes = screen.queryAllByRole("checkbox");
      expect(checkboxes).toHaveLength(0);
    });

    it("does not show action bar when nothing is selected", () => {
      const permissions = [
        makePermission({ id: "p1", status: "pending" }),
      ];
      const onDecide = vi.fn();
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      // Action bar should not be present when nothing selected
      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(screen.queryByText(/Approve Selected/)).toBeNull();
      expect(screen.queryByText(/Deny Selected/)).toBeNull();
    });

    it("shows action bar when at least one pending is selected", () => {
      const permissions = [
        makePermission({ id: "p1", toolName: "Bash", status: "pending" }),
        makePermission({ id: "p2", toolName: "Write", status: "approved" }),
      ];
      const onDecide = vi.fn();
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);

      expect(screen.getByRole("toolbar")).toBeTruthy();
      expect(screen.getByText(/Approve Selected/)).toBeTruthy();
      expect(screen.getByText(/Deny Selected/)).toBeTruthy();
    });

    it("calls onDecide for each selected ID with 'approved' when Approve Selected is clicked", async () => {
      const permissions = [
        makePermission({ id: "p1", toolName: "Bash", status: "pending" }),
        makePermission({ id: "p2", toolName: "Write", status: "pending" }),
        makePermission({ id: "p3", toolName: "Read", status: "approved" }),
      ];
      const onDecide = vi.fn().mockResolvedValue(undefined);
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      const approveBtn = screen.getByText(/Approve Selected/);
      fireEvent.click(approveBtn);

      // Wait for promise resolution
      await vi.waitFor(() => {
        expect(onDecide).toHaveBeenCalledTimes(2);
      });

      expect(onDecide).toHaveBeenCalledWith("p1", "approved");
      expect(onDecide).toHaveBeenCalledWith("p2", "approved");
    });

    it("calls onDecide for each selected ID with 'denied' when Deny Selected is clicked", async () => {
      const permissions = [
        makePermission({ id: "p1", toolName: "Bash", status: "pending" }),
        makePermission({ id: "p2", toolName: "Write", status: "pending" }),
      ];
      const onDecide = vi.fn().mockResolvedValue(undefined);
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      const denyBtn = screen.getByText(/Deny Selected/);
      fireEvent.click(denyBtn);

      await vi.waitFor(() => {
        expect(onDecide).toHaveBeenCalledTimes(2);
      });

      expect(onDecide).toHaveBeenCalledWith("p1", "denied");
      expect(onDecide).toHaveBeenCalledWith("p2", "denied");
    });

    it("clears selection after batch action completes", async () => {
      const permissions = [
        makePermission({ id: "p1", toolName: "Bash", status: "pending" }),
      ];
      const onDecide = vi.fn().mockResolvedValue(undefined);
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      // Action bar visible
      expect(screen.getByRole("toolbar")).toBeTruthy();

      const approveBtn = screen.getByText(/Approve Selected/);
      fireEvent.click(approveBtn);

      await vi.waitFor(() => {
        expect(screen.queryByRole("toolbar")).toBeNull();
      });
    });

    it("Select all pending selects only pending items", () => {
      const permissions = [
        makePermission({ id: "p1", toolName: "Bash", status: "pending" }),
        makePermission({ id: "p2", toolName: "Write", status: "pending" }),
        makePermission({ id: "p3", toolName: "Read", status: "approved" }),
        makePermission({ id: "p4", toolName: "Edit", status: "denied" }),
      ];
      const onDecide = vi.fn();
      render(<PermissionHistory permissions={permissions} onDecide={onDecide} />);

      const selectAllBtn = screen.getByText(/Select all/i);
      fireEvent.click(selectAllBtn);

      // Action bar should show 2 selected (only pending ones)
      expect(screen.getByRole("toolbar")).toBeTruthy();
      expect(screen.getByText("2 selected")).toBeTruthy();

      // All pending checkboxes should be checked (aria-checked for button-role checkboxes)
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(2);
      checkboxes.forEach((cb) => {
        expect(cb.getAttribute("aria-checked")).toBe("true");
      });
    });
  });
});
