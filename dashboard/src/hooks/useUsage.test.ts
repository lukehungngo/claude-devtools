import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUsage } from "./useUsage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUsage", () => {
  it("fetches usage on mount when API returns ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ usage: { tokensIn: 100, tokensOut: 50 } }),
      })
    );

    const { result } = renderHook(() => useUsage());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(result.current.usage).not.toBeNull();
    expect((result.current.usage as { tokensIn: number }).tokensIn).toBe(100);
  });

  it("non-2xx response leaves usage null (does not accept poisoned usage data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ usage: { tokensIn: 9999999 } }),
      })
    );

    const { result } = renderHook(() => useUsage());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(result.current.usage).toBeNull();
  });
});
