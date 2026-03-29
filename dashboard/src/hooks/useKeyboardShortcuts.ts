import { useEffect, useCallback, useRef } from "react";

export interface ShortcutActions {
  onClear?: () => void;
  onCompact?: () => void;
  onDismiss?: () => void;
  onToggleTasks?: () => void;
}

/**
 * Registers global keyboard shortcuts for the conversation view.
 *
 * Shortcuts:
 * - Ctrl+L / Cmd+L -> onClear (clear conversation)
 * - Ctrl+Shift+K / Cmd+Shift+K -> onCompact (compact context)
 * - Escape -> onDismiss (dismiss panels/modals)
 *
 * Shortcuts are ignored when the active element is an input, textarea,
 * or contentEditable element.
 */
export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Ignore when typing in input fields
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return;
        }
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+L / Cmd+L -> clear
      if (isMod && e.key === "l") {
        e.preventDefault();
        actionsRef.current.onClear?.();
        return;
      }

      // Ctrl+Shift+K / Cmd+Shift+K -> compact
      if (isMod && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        actionsRef.current.onCompact?.();
        return;
      }

      // Ctrl+T / Cmd+T -> toggle tasks panel
      if (isMod && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        actionsRef.current.onToggleTasks?.();
        return;
      }

      // Escape -> dismiss
      if (e.key === "Escape") {
        e.preventDefault();
        actionsRef.current.onDismiss?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
