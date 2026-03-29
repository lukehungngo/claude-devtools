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
    agentId: "main",
    toolName: "Read",
    input: { file_path: "/src/index.ts" },
    timestamp: "2026-01-01T00:00:00Z",
    status: "pending",
    ...overrides,
  };
}

describe("PermissionBlock: rich SDK fields", () => {
  it("shows title as header when provided", () => {
    const perm = makePermission({ title: "Read file /src/index.ts" });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByTestId("permission-title").textContent).toBe("Read file /src/index.ts");
  });

  it("falls back to 'Permission Required' when no title", () => {
    const perm = makePermission({ title: undefined });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByTestId("permission-title").textContent).toBe("Permission Required");
  });

  it("shows description when provided", () => {
    const perm = makePermission({
      description: "The agent wants to read this file",
    });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByTestId("permission-description").textContent).toBe(
      "The agent wants to read this file"
    );
  });

  it("hides description when not provided", () => {
    const perm = makePermission({ description: undefined });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(container.querySelector("[data-testid='permission-description']")).toBeNull();
  });

  it("uses displayName on Allow/Deny buttons when provided", () => {
    const perm = makePermission({ displayName: "Read file" });
    const { getByText } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByText("Allow Read file")).toBeTruthy();
    expect(getByText("Deny Read file")).toBeTruthy();
  });

  it("uses default Allow/Deny labels when displayName is absent", () => {
    const perm = makePermission({ displayName: undefined });
    const { getByText } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByText("Allow")).toBeTruthy();
    expect(getByText("Deny")).toBeTruthy();
  });

  it("shows agentId from SDK agentID field", () => {
    const perm = makePermission({ agentId: "subagent-12345678-abcd" });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    const badge = getByTestId("agent-id-badge");
    expect(badge.textContent).toBe("subagent");
  });

  it("renders suggestions bar when suggestions are present", () => {
    const perm = makePermission({
      suggestions: [
        { type: "addRules", rules: [{ toolName: "Read", ruleContent: "Read(*)" }], behavior: "allow", destination: "session" },
      ],
    });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(getByTestId("suggestions-bar")).toBeTruthy();
  });

  it("hides suggestions bar when suggestions are empty", () => {
    const perm = makePermission({ suggestions: [] });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(container.querySelector("[data-testid='suggestions-bar']")).toBeNull();
  });

  it("hides suggestions bar when suggestions are undefined", () => {
    const perm = makePermission({ suggestions: undefined });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(container.querySelector("[data-testid='suggestions-bar']")).toBeNull();
  });

  it("calls onSuggestion when suggestion button is clicked", () => {
    const onSuggestion = vi.fn();
    const suggestion = { type: "addRules", rules: [{ toolName: "Read" }], behavior: "allow", destination: "session" };
    const perm = makePermission({ suggestions: [suggestion] });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} onSuggestion={onSuggestion} />
    );
    const bar = getByTestId("suggestions-bar");
    const btn = bar.querySelector("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onSuggestion).toHaveBeenCalledWith("perm-1", suggestion);
  });

  it("hides suggestions after permission is resolved", () => {
    const perm = makePermission({
      status: "approved",
      suggestions: [
        { type: "addRules", rules: [{ toolName: "Read" }], behavior: "allow", destination: "session" },
      ],
    });
    const { container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    expect(container.querySelector("[data-testid='suggestions-bar']")).toBeNull();
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(100);
    const perm = makePermission({ title: longTitle });
    const { getByTestId } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    const titleEl = getByTestId("permission-title");
    // Should be truncated to 80 chars + "..."
    expect(titleEl.textContent!.length).toBeLessThan(100);
    expect(titleEl.textContent!.endsWith("...")).toBe(true);
  });

  it("is fully backward compatible -- renders as before with no rich fields", () => {
    const perm = makePermission();
    const { getByTestId, getByText, container } = render(
      <PermissionBlock permission={perm} onDecide={vi.fn()} />
    );
    // Title fallback
    expect(getByTestId("permission-title").textContent).toBe("Permission Required");
    // No description
    expect(container.querySelector("[data-testid='permission-description']")).toBeNull();
    // No suggestions
    expect(container.querySelector("[data-testid='suggestions-bar']")).toBeNull();
    // Default button labels
    expect(getByText("Allow")).toBeTruthy();
    expect(getByText("Deny")).toBeTruthy();
    // Tool name badge present
    expect(getByText("Read")).toBeTruthy();
  });
});
