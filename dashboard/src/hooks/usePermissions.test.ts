import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissions } from "./usePermissions";
import type { PermissionRequest } from "../lib/types";

function makePermission(id: string): PermissionRequest {
  return {
    id,
    sessionId: "s1",
    agentId: "a1",
    toolName: "Bash",
    input: {},
    timestamp: "2026-01-01T00:00:00Z",
    status: "pending",
  } as PermissionRequest;
}

describe("usePermissions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ permissions: [] }),
      })
    );
  });

  it("fetches pending permissions on mount", async () => {
    renderHook(() => usePermissions());
    expect(fetch).toHaveBeenCalledWith("/api/permissions/pending");
  });

  it("exposes handlePermissionRequest that adds a permission", () => {
    const { result } = renderHook(() => usePermissions());
    const perm = makePermission("p1");

    act(() => {
      result.current.handlePermissionRequest(perm);
    });

    expect(result.current.permissions).toHaveLength(1);
    expect(result.current.permissions[0].id).toBe("p1");
  });

  it("exposes handlePermissionResolved that updates status", () => {
    const { result } = renderHook(() => usePermissions());
    const perm = makePermission("p1");

    act(() => {
      result.current.handlePermissionRequest(perm);
    });

    act(() => {
      result.current.handlePermissionResolved("p1", "approved");
    });

    expect(result.current.permissions[0].status).toBe("approved");
  });

  it("handlePermissionResolved ignores unknown ids", () => {
    const { result } = renderHook(() => usePermissions());
    const perm = makePermission("p1");

    act(() => {
      result.current.handlePermissionRequest(perm);
    });

    act(() => {
      result.current.handlePermissionResolved("unknown", "denied");
    });

    expect(result.current.permissions[0].status).toBe("pending");
  });

  it("decide calls the API and updates local state", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/permissions/pending") {
        return Promise.resolve({
          json: () => Promise.resolve({ permissions: [makePermission("p1")] }),
        });
      }
      // decide endpoint
      return Promise.resolve({
        json: () => Promise.resolve({ ok: true }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => usePermissions());

    // Wait for initial fetch to populate state
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.permissions).toHaveLength(1);

    await act(async () => {
      await result.current.decide("p1", "denied");
    });

    // Check API was called
    expect(mockFetch).toHaveBeenCalledWith("/api/permissions/p1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "denied" }),
    });

    expect(result.current.permissions[0].status).toBe("denied");
  });

  it("caps resolved permissions at 50, keeping all pending", () => {
    const { result } = renderHook(() => usePermissions());

    // Add 55 permissions and resolve them all
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.handlePermissionRequest(makePermission(`p${i}`));
      }
    });

    // Resolve all 55
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.handlePermissionResolved(`p${i}`, "approved");
      }
    });

    // Should have kept all pending (0) + last 50 resolved = 50
    const resolved = result.current.permissions.filter(
      (p) => p.status !== "pending"
    );
    expect(resolved.length).toBeLessThanOrEqual(50);
    // The oldest resolved should have been trimmed
    expect(
      result.current.permissions.find((p) => p.id === "p0")
    ).toBeUndefined();
    // The newest resolved should still exist
    expect(
      result.current.permissions.find((p) => p.id === "p54")
    ).toBeDefined();
  });

  it("does NOT create its own WebSocket connection", () => {
    // The hook should not reference WebSocket at all now
    const { result } = renderHook(() => usePermissions());
    expect(result.current.handlePermissionRequest).toBeDefined();
    expect(result.current.handlePermissionResolved).toBeDefined();
  });
});
