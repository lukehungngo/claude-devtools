import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PurgeConfirmModal } from "./PurgeConfirmModal";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function dryRunResponse(files: string[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        files,
        rawStdout: files.map((f) => `Would delete: ${f}`).join("\n"),
        rawStderr: "",
        exitCode: 0,
      }),
  };
}

function purgeResponse(ok: boolean) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({ ok, stdout: "", stderr: ok ? "" : "fail", exitCode: ok ? 0 : 1 }),
  };
}

describe("PurgeConfirmModal", () => {
  it("renders a loading state, then the dry-run file list, with confirm disabled until checkbox is ticked", async () => {
    fetchMock.mockResolvedValueOnce(dryRunResponse(["/a.jsonl", "/b.jsonl", "/c.jsonl"]));

    render(
      <PurgeConfirmModal
        projectHash="h1"
        projectName="my-repo"
        onClose={vi.fn()}
        onPurged={vi.fn()}
      />,
    );

    // Initial: spinner / loading text
    expect(screen.getByText(/loading|computing|dry/i)).toBeTruthy();

    // Wait for dry-run to populate
    await waitFor(() => {
      expect(screen.getByText("/a.jsonl")).toBeTruthy();
    });
    expect(screen.getByText("/b.jsonl")).toBeTruthy();
    expect(screen.getByText("/c.jsonl")).toBeTruthy();

    const confirmBtn = screen.getByRole("button", { name: /yes, purge/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Tick the acknowledgement checkbox
    const checkbox = screen.getByRole("checkbox", { name: /3 files/i });
    fireEvent.click(checkbox);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
  });

  it("calls the live purge endpoint with confirm:true and fires onPurged on success", async () => {
    fetchMock
      .mockResolvedValueOnce(dryRunResponse(["/x.jsonl"]))
      .mockResolvedValueOnce(purgeResponse(true));
    const onPurged = vi.fn();
    const onClose = vi.fn();

    render(
      <PurgeConfirmModal
        projectHash="h1"
        projectName="my-repo"
        onClose={onClose}
        onPurged={onPurged}
      />,
    );

    await waitFor(() => screen.getByText("/x.jsonl"));
    fireEvent.click(screen.getByRole("checkbox", { name: /1 file/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, purge/i }));

    await waitFor(() => expect(onPurged).toHaveBeenCalledTimes(1));

    // Inspect the POST body to /api/projects/h1/purge
    const liveCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/api/projects/h1/purge"),
    );
    expect(liveCall).toBeDefined();
    const init = liveCall![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ confirm: true });
  });

  it("renders an error state if dry-run fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Claude CLI not found in PATH" }),
    });

    render(
      <PurgeConfirmModal
        projectHash="h1"
        projectName="my-repo"
        onClose={vi.fn()}
        onPurged={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/claude cli not found/i)).toBeTruthy();
    });
    // Confirm button shouldn't render in error state
    expect(screen.queryByRole("button", { name: /yes, purge/i })).toBeNull();
  });

  it("calls onClose when the Cancel button is clicked", async () => {
    fetchMock.mockResolvedValueOnce(dryRunResponse([]));
    const onClose = vi.fn();
    render(
      <PurgeConfirmModal
        projectHash="h1"
        projectName="my-repo"
        onClose={onClose}
        onPurged={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByRole("button", { name: /cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
