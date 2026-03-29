import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryEditor } from "../MemoryEditor";

describe("MemoryEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders placeholder when no session identifiers provided", () => {
    render(<MemoryEditor />);
    expect(screen.getByText("Select a session to view CLAUDE.md")).toBeTruthy();
  });

  it("renders empty state when API returns null content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: null }),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("No CLAUDE.md found")).toBeTruthy();
    });
  });

  it("renders markdown content in preview mode when available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "# My Project\n\nSome description" }),
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
      json: async () => ({ content: null }),
    } as Response);

    render(<MemoryEditor projectHash="proj1" sessionId="sess1" />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/sessions/proj1/sess1/memory");
    });
  });

  it("shows file tier badge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "# Hello World" }),
    } as Response);

    render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("project")).toBeTruthy();
    });
  });

  it("has edit and preview mode toggle buttons", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "# Hello World" }),
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
      json: async () => ({ content: "# Test content" }),
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
      json: async () => ({ content: "# Sample" }),
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
      json: async () => ({ content: "# Sample" }),
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

  it("calls PUT endpoint on save", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "# Original" }),
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
          body: JSON.stringify({ content: "# Updated" }),
        }),
      );
    });
  });

  it("shows saved status after successful save", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "# Original" }),
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
});
