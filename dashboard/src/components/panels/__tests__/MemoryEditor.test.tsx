import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryEditor } from "../MemoryEditor";

function mockMemoryResponse(
  projectContent: string | null,
  userContent: string | null = null,
) {
  return {
    content: projectContent,
    tiers: [
      { name: "user", label: "User", path: "/home/.claude/CLAUDE.md", content: userContent },
      { name: "project", label: "Project", path: "/tmp/CLAUDE.md", content: projectContent },
    ],
  };
}

describe("MemoryEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders placeholder when no session identifiers provided", () => {
    render(<MemoryEditor />);
    expect(screen.getByText("Select a session to view CLAUDE.md")).toBeTruthy();
  });

  it("renders empty state when API returns null content for all tiers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse(null, null),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("No CLAUDE.md found")).toBeTruthy();
    });
  });

  it("renders markdown content in preview mode when available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# My Project\n\nSome description"),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeTruthy();
    });
    expect(screen.getByText("Some description")).toBeTruthy();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("fetches from the correct API endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse(null),
    } as Response);

    render(<MemoryEditor projectHash="proj1" sessionId="sess1" />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/sessions/proj1/sess1/memory");
    });
  });

  it("shows tier tab buttons for User and Project", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# Hello World"),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeTruthy();
    });
    expect(container.querySelector('[aria-label="User tier"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Project tier"]')).toBeTruthy();
  });

  it("defaults to first tier with content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse(null, "# User level notes"),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("User level notes")).toBeTruthy();
    });
  });

  it("switches tier when tab is clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "# Project notes here",
        tiers: [
          { name: "user", label: "User", path: "/home/.claude/CLAUDE.md", content: "# User notes here" },
          { name: "project", label: "Project", path: "/tmp/CLAUDE.md", content: "# Project notes here" },
        ],
      }),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    // Should default to user since it has content and appears first
    await waitFor(() => {
      expect(screen.getByText("User notes here")).toBeTruthy();
    });

    // Switch to project tier via aria-label
    const projectTab = container.querySelector('[aria-label="Project tier"]') as HTMLElement;
    fireEvent.click(projectTab);
    await waitFor(() => {
      expect(screen.getByText("Project notes here")).toBeTruthy();
    });
  });

  it("has edit and preview mode toggle buttons", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# Hello World"),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeTruthy();
    });
    expect(container.querySelector('[aria-label="Preview mode"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Edit mode"]')).toBeTruthy();
  });

  it("switches to edit mode and shows textarea", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# Test content"),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Test content")).toBeTruthy();
    });

    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toBe("# Test content");
    });
  });

  it("shows save button in edit mode, disabled when not dirty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# Sample"),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Sample")).toBeTruthy();
    });

    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      const saveButton = container.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
      expect(saveButton).toBeTruthy();
      expect(saveButton.disabled).toBe(true);
    });
  });

  it("enables save button when content is modified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMemoryResponse("# Sample"),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Sample")).toBeTruthy();
    });

    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeTruthy();
    });

    const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# Modified" } });

    const saveButton = container.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it("calls PUT endpoint with tier on save", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse("# Original"),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Original")).toBeTruthy();
    });

    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeTruthy();
    });

    const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# Updated" } });

    const saveButton = container.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sessions/ph1/s1/memory",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ content: "# Updated", tier: "project" }),
        }),
      );
    });
  });

  it("non-2xx load does not render poisoned content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ content: "# injected by server error" }),
    } as unknown as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);

    // Wait for loading to complete (Loading... disappears)
    await waitFor(() => {
      expect(within(container).queryByText("Loading...")).toBeNull();
    });

    // Now assert the poisoned content is not shown
    expect(within(container).queryByText("injected by server error")).toBeNull();
  });

  it("non-2xx save does NOT show Saved — shows error instead", async () => {
    vi.spyOn(globalThis, "fetch")
      // First call: load succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse("# My Project"),
      } as Response)
      // Second call: save returns 500 with success: true (poisoned response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ success: true }),
      } as unknown as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeTruthy();
    });

    // Switch to edit mode
    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeTruthy();
    });

    // Make content dirty so Save button is enabled
    const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# My Project Modified" } });

    // Click Save
    const saveBtn = container.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(within(container).queryByText("Saved")).toBeNull();
      expect(within(container).getByText(/error/i)).toBeTruthy();
    });
  });

  it("shows saved status after successful save", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse("# Original"),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Original")).toBeTruthy();
    });

    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeTruthy();
    });

    const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# Updated" } });

    const saveButton = container.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeTruthy();
    });
  });

  it("resets dirty state and mode when switching tiers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "# Project notes here",
        tiers: [
          { name: "user", label: "User", path: "/home/.claude/CLAUDE.md", content: "# User notes here" },
          { name: "project", label: "Project", path: "/tmp/CLAUDE.md", content: "# Project notes here" },
        ],
      }),
    } as Response);

    const { container } = render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("User notes here")).toBeTruthy();
    });

    // Switch to edit mode and make changes
    const editBtn = container.querySelector('[aria-label="Edit mode"]') as HTMLElement;
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeTruthy();
    });

    const textarea = container.querySelector('[aria-label="CLAUDE.md editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# Modified user content" } });

    // Switch tier via aria-label -- should reset to preview mode
    const projectTab = container.querySelector('[aria-label="Project tier"]') as HTMLElement;
    expect(projectTab).toBeTruthy();
    fireEvent.click(projectTab);

    await waitFor(() => {
      // Should be back in preview mode (no textarea visible)
      expect(container.querySelector('[aria-label="CLAUDE.md editor"]')).toBeNull();
    });

    // Project content should now be rendered
    expect(within(container).getByText("Project notes here")).toBeTruthy();
  });

  it("handles legacy response without tiers field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "# Legacy content" }),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Legacy content")).toBeTruthy();
    });
  });
});
