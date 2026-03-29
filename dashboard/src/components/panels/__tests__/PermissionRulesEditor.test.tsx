import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PermissionRulesEditor } from "../PermissionRulesEditor";

function mockFetchResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("PermissionRulesEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<PermissionRulesEditor />);
    expect(screen.getByText("Loading permissions...")).toBeTruthy();
  });

  it("renders allow, deny, ask columns with rules as pills", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      mockFetchResponse({
        allow: ["Glob(**/*.ts)", "Bash(pnpm lint)"],
        deny: ["Write(/etc/**)"],
        ask: ["Edit(/src/**)"],
      }) as Promise<Response>,
    );
    render(<PermissionRulesEditor />);

    await waitFor(() => {
      expect(screen.getByText("Glob(**/*.ts)")).toBeTruthy();
    });

    expect(screen.getByText("Bash(pnpm lint)")).toBeTruthy();
    expect(screen.getByText("Write(/etc/**)")).toBeTruthy();
    expect(screen.getByText("Edit(/src/**)")).toBeTruthy();
  });

  it("renders empty state when no rules", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      mockFetchResponse({ allow: [], deny: [], ask: [] }) as Promise<Response>,
    );
    render(<PermissionRulesEditor />);

    await waitFor(() => {
      expect(screen.getByText("Allow")).toBeTruthy();
    });

    expect(screen.getByText("Deny")).toBeTruthy();
    expect(screen.getByText("Ask")).toBeTruthy();
  });

  it("deletes a rule when X is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockImplementationOnce(() =>
      mockFetchResponse({
        allow: ["Grep(pattern)"],
        deny: [],
        ask: [],
      }) as Promise<Response>,
    );

    render(<PermissionRulesEditor />);

    await waitFor(() => {
      expect(screen.getByText("Grep(pattern)")).toBeTruthy();
    });

    // Mock the PUT call
    fetchSpy.mockImplementationOnce(() =>
      mockFetchResponse({ success: true }) as Promise<Response>,
    );

    const deleteButtons = screen.getAllByLabelText(/Remove rule/);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/settings/permissions",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("adds a rule via the input form", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockImplementationOnce(() =>
      mockFetchResponse({ allow: [], deny: [], ask: [] }) as Promise<Response>,
    );

    render(<PermissionRulesEditor />);

    await waitFor(() => {
      expect(screen.getByText("Allow")).toBeTruthy();
    });

    const inputs = screen.getAllByPlaceholderText("ToolName(pattern)");
    fireEvent.change(inputs[0], { target: { value: "Grep(pattern)" } });

    fetchSpy.mockImplementationOnce(() =>
      mockFetchResponse({ success: true }) as Promise<Response>,
    );

    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/settings/permissions",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("Grep(pattern)"),
        }),
      );
    });
  });
});
