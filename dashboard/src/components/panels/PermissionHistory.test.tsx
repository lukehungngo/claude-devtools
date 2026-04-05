import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
});
