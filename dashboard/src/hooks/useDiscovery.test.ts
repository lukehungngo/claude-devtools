import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDiscoveryCommands, useDiscoveryModels, useDiscoveryAgents } from "./useDiscovery";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDiscoveryCommands", () => {
  it("fetches from /api/commands when no sessionId", async () => {
    const serverCommands = [
      { name: "help", description: "Show help" },
      { name: "compact", description: "Compact context" },
      { name: "commit", description: "Commit changes" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commands: serverCommands, source: "global-cache" }),
    });

    const { result } = renderHook(() => useDiscoveryCommands(undefined));

    // Initially has client fallback + dashboard-only commands
    expect(result.current.length).toBeGreaterThan(30);

    await waitFor(() => {
      // After fetch, should have server commands + dashboard-only merged
      expect(fetchMock).toHaveBeenCalledWith("/api/commands");
    });

    const names = result.current.map((c) => c.name);
    expect(names).toContain("/help");
    expect(names).toContain("/copy");
  });

  it("fetches commands from server and merges dashboard-only commands", async () => {
    const sdkCommands = [
      { name: "help", description: "Show help", argumentHint: "" },
      { name: "compact", description: "Compact context", argumentHint: "" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commands: sdkCommands }),
    });

    const { result } = renderHook(() => useDiscoveryCommands("session-123"));

    await waitFor(() => {
      // 2 SDK commands + dashboard-only commands (copy, export, analytics, shortcuts, exit)
      expect(result.current.length).toBeGreaterThan(2);
    });

    // SDK commands should be present with "/" prefix
    const names = result.current.map((c) => c.name);
    expect(names).toContain("/help");
    expect(names).toContain("/compact");
    // Dashboard-only commands should be merged in
    expect(names).toContain("/copy");
    expect(names).toContain("/export");
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-123/commands");
  });

  it("falls back to hardcoded list on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDiscoveryCommands("session-456"));

    // Should still have the full fallback commands immediately (CLI + dashboard-only)
    expect(result.current.length).toBeGreaterThan(30);
    expect(result.current[0]).toHaveProperty("name");
  });

  it("falls back to hardcoded when server returns non-ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "not found" }),
    });

    const { result } = renderHook(() => useDiscoveryCommands("session-789"));

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Should still have full fallback commands (CLI + dashboard-only)
    expect(result.current.length).toBeGreaterThan(30);
  });

  it("does not refetch when sessionId stays the same", async () => {
    const sdkCommands = [
      { name: "help", description: "Show help", argumentHint: "" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commands: sdkCommands }),
    });

    const { result, rerender } = renderHook(
      ({ id }) => useDiscoveryCommands(id),
      { initialProps: { id: "session-stable" } }
    );

    await waitFor(() => {
      // 1 SDK command + 5 dashboard-only commands
      expect(result.current.length).toBe(6);
    });

    // Rerender with same sessionId
    rerender({ id: "session-stable" });

    // Should only have been called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when sessionId changes", async () => {
    const commands1 = [{ name: "help", description: "Help 1", argumentHint: "" }];
    const commands2 = [
      { name: "help", description: "Help 2", argumentHint: "" },
      { name: "compact", description: "Compact 2", argumentHint: "" },
    ];

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ commands: commands1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ commands: commands2 }),
      });

    const { result, rerender } = renderHook(
      ({ id }) => useDiscoveryCommands(id),
      { initialProps: { id: "session-a" } }
    );

    await waitFor(() => {
      // 1 SDK command + 5 dashboard-only commands
      expect(result.current.length).toBe(6);
    });

    // Change sessionId
    rerender({ id: "session-b" });

    await waitFor(() => {
      // 2 SDK commands + 5 dashboard-only commands
      expect(result.current.length).toBe(7);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useDiscoveryModels", () => {
  it("returns empty array when no sessionId", () => {
    const { result } = renderHook(() => useDiscoveryModels(undefined));
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches models from server when sessionId is provided", async () => {
    const models = [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models }),
    });

    const { result } = renderHook(() => useDiscoveryModels("session-m1"));

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    });

    expect(result.current).toEqual(models);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-m1/models");
  });

  it("returns empty array on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDiscoveryModels("session-m2"));

    // Wait for fetch to settle
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(result.current).toEqual([]);
  });

  it("does not refetch when sessionId stays the same", async () => {
    const models = [{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" }];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models }),
    });

    const { result, rerender } = renderHook(
      ({ id }) => useDiscoveryModels(id),
      { initialProps: { id: "session-m3" as string | undefined } }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    rerender({ id: "session-m3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useDiscoveryAgents", () => {
  it("returns empty array when no sessionId", () => {
    const { result } = renderHook(() => useDiscoveryAgents(undefined));
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches agents from server when sessionId is provided", async () => {
    const agents = [
      { id: "main", name: "Main Agent" },
      { id: "sub-1", name: "Sub Agent 1" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents }),
    });

    const { result } = renderHook(() => useDiscoveryAgents("session-a1"));

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    });

    expect(result.current).toEqual(agents);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-a1/agents");
  });

  it("returns empty array on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDiscoveryAgents("session-a2"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(result.current).toEqual([]);
  });

  it("does not refetch when sessionId stays the same", async () => {
    const agents = [{ id: "main", name: "Main Agent" }];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents }),
    });

    const { result, rerender } = renderHook(
      ({ id }) => useDiscoveryAgents(id),
      { initialProps: { id: "session-a3" as string | undefined } }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    rerender({ id: "session-a3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
