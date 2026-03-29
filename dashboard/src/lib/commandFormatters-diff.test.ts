/**
 * Tests for formatDiffCommand returning both stat and full diff (P0-05)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDiffCommand } from "./commandFormatters";

describe("formatDiffCommand full diff (P0-05)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  it("displays stat followed by full diff when both present", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        stat: " src/index.ts | 5 ++---\n 1 file changed\n",
        diff: "diff --git a/src/index.ts b/src/index.ts\n-old\n+new\n",
      }),
    });

    const result = await formatDiffCommand("projHash", "sess1");

    expect(result).toContain("src/index.ts | 5 ++---");
    expect(result).toContain("diff --git");
    expect(result).toContain("-old");
    expect(result).toContain("+new");
  });

  it("shows stat only when full diff is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        stat: " 1 file changed\n",
        diff: "",
      }),
    });

    const result = await formatDiffCommand("projHash", "sess1");
    expect(result).toContain("1 file changed");
  });

  it("returns 'No uncommitted changes' when both are empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ stat: "", diff: "" }),
    });

    const result = await formatDiffCommand("projHash", "sess1");
    expect(result).toBe("No uncommitted changes.");
  });

  it("falls back to legacy diff field if stat not present", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ diff: "some diff content" }),
    });

    const result = await formatDiffCommand("projHash", "sess1");
    expect(result).toContain("some diff content");
  });
});
