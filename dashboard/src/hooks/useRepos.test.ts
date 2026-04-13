import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRepos } from "./useRepos";

const mockRepos = [{ repoRoot: "/foo", slug: "foo", sessions: [] }];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ repos: mockRepos }),
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRepos", () => {
  it("fetches repos on mount", async () => {
    const { result } = renderHook(() => useRepos());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.repos).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it("ignores non-2xx on initial fetch — repos stays empty", async () => {
    const poisonedBody = { repos: mockRepos };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve(poisonedBody),
      })
    );

    const { result } = renderHook(() => useRepos());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.repos).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it("ignores non-2xx on refresh — repos stays as previously loaded", async () => {
    const { result } = renderHook(() => useRepos());

    // Initial load succeeds
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.repos).toHaveLength(1);

    // Refresh returns a 500 with poisoned body
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ repos: [{ repoRoot: "/evil", slug: "evil", sessions: [] }] }),
      })
    );

    act(() => {
      result.current.refresh();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should still have original repos, not poisoned ones
    expect(result.current.repos).toHaveLength(1);
    expect(result.current.repos[0].repoRoot).toBe("/foo");
  });
});
