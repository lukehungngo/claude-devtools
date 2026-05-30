import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizablePanel } from "./useResizablePanel";

const KEY = "dt-test-rail-width";

beforeEach(() => {
  window.localStorage.clear();
  // jsdom defaults innerWidth to 1024; make it deterministic.
  Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useResizablePanel", () => {
  it("starts at the default width when nothing is stored", () => {
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    expect(result.current.width).toBe(460);
    expect(result.current.dragging).toBe(false);
  });

  it("restores a stored width", () => {
    window.localStorage.setItem(KEY, "540");
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    expect(result.current.width).toBe(540);
  });

  it("persists width changes to localStorage", () => {
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    act(() => result.current.reset());
    expect(window.localStorage.getItem(KEY)).toBe("460");
  });

  it("reset returns to the default width", () => {
    window.localStorage.setItem(KEY, "700");
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    expect(result.current.width).toBe(700);
    act(() => result.current.reset());
    expect(result.current.width).toBe(460);
  });

  it("sets dragging=true on pointer down", () => {
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    act(() => {
      result.current.onPointerDown({
        clientX: 800,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });
    expect(result.current.dragging).toBe(true);
  });

  it("resizes on pointer move while dragging (drag handle left → wider)", () => {
    const { result } = renderHook(() => useResizablePanel(KEY, 460));
    act(() => {
      result.current.onPointerDown({ clientX: 800, preventDefault: () => {} } as unknown as React.PointerEvent);
    });
    act(() => {
      // move 100px left → width grows by 100 → 560
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 700 }));
    });
    expect(result.current.width).toBe(560);
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", {}));
    });
    expect(result.current.dragging).toBe(false);
  });
});
