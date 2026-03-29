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
  it("returns hardcoded fallback when no sessionId", () => {
    const { result } = renderHook(() => useDiscoveryCommands(undefined));
    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current[0]).toHaveProperty("name");
    expect(result.current[0]).toHaveProperty("description");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches commands from server when sessionId is provided", async () => {
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
      expect(result.current.length).toBe(2);
    });

    expect(result.current).toEqual(
      sdkCommands.map((c) => ({ name: "/" + c.name, description: c.description }))
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-123/commands");
  });

  it("falls back to hardcoded list on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDiscoveryCommands("session-456"));

    // Should still have the fallback commands immediately
    expect(result.current.length).toBeGreaterThan(0);
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

    // Should still have fallback commands
    expect(result.current.length).toBeGreaterThan(0);
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
      expect(result.current.length).toBe(1);
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
      expect(result.current.length).toBe(1);
    });

    // Change sessionId
    rerender({ id: "session-b" });

    await waitFor(() => {
      expect(result.current.length).toBe(2);
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
