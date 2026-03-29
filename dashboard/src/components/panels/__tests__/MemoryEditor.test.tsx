import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("renders markdown content when available", async () => {
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
});
