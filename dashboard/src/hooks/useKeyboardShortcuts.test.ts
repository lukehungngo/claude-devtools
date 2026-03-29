import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { ShortcutActions } from "./useKeyboardShortcuts";

function fireKey(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
  target?: EventTarget
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  // If target specified, set it as the active element
  if (target && target instanceof HTMLElement) {
    target.focus();
    target.dispatchEvent(event);
  } else {
    document.dispatchEvent(event);
  }
}

describe("useKeyboardShortcuts", () => {
  let actions: ShortcutActions;

  beforeEach(() => {
    actions = {
      onClear: vi.fn(),
      onCompact: vi.fn(),
      onDismiss: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onClear on Ctrl+L", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("l", { ctrlKey: true });
    expect(actions.onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onClear on Meta+L (macOS)", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("l", { metaKey: true });
    expect(actions.onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onCompact on Ctrl+Shift+K", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("K", { ctrlKey: true, shiftKey: true });
    expect(actions.onCompact).toHaveBeenCalledTimes(1);
  });

  it("calls onCompact on Meta+Shift+K (macOS)", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("K", { metaKey: true, shiftKey: true });
    expect(actions.onCompact).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss on Escape", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("Escape");
    expect(actions.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts when target is an input element", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireKey("l", { ctrlKey: true }, input);
    expect(actions.onClear).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores shortcuts when target is a textarea element", () => {
    renderHook(() => useKeyboardShortcuts(actions));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireKey("l", { ctrlKey: true }, textarea);
    expect(actions.onClear).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("does not call undefined actions", () => {
    const partial: ShortcutActions = { onClear: vi.fn() };
    renderHook(() => useKeyboardShortcuts(partial));
    // Should not throw when Escape is pressed but onDismiss is undefined
    fireKey("Escape");
    expect(partial.onClear).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts(actions));
    unmount();
    fireKey("l", { ctrlKey: true });
    expect(actions.onClear).not.toHaveBeenCalled();
  });
});
