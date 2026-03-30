import { useEffect, useRef } from "react";

export interface ShortcutActions {
  onClear?: () => void;
  onCompact?: () => void;
  onDismiss?: () => void;
  onToggleTasks?: () => void;
  onToggleMonitor?: () => void;
  onToggleSearch?: () => void;
  onModelPicker?: () => void;
  onToggleThinking?: () => void;
  onToggleFastMode?: () => void;
  onRewindMenu?: () => void;
}

/**
 * Registers global keyboard shortcuts for the conversation view.
 *
 * Shortcuts:
 * - Ctrl+L / Cmd+L -> onClear
 * - Ctrl+Shift+K / Cmd+Shift+K -> onCompact
 * - Ctrl+T / Cmd+T -> onToggleTasks
 * - Ctrl+B / Cmd+B -> onToggleMonitor
 * - Ctrl+F / Cmd+F -> onToggleSearch
 * - Alt+P -> onModelPicker
 * - Alt+T -> onToggleThinking
 * - Alt+O -> onToggleFastMode
 * - Esc Esc (double-tap) -> onRewindMenu
 * - Escape -> onDismiss
 *
 * Shortcuts are ignored when the active element is an input, textarea,
 * or contentEditable element (except Ctrl+F and Escape).
 */
export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const lastEscRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const isInputField = target && (
        target.tagName?.toLowerCase() === "input" ||
        target.tagName?.toLowerCase() === "textarea" ||
        target.isContentEditable
      );

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+F works everywhere (including inputs) — overrides browser find
      if (isMod && e.key === "f") {
        e.preventDefault();
        actionsRef.current.onToggleSearch?.();
        return;
      }

      // Escape works everywhere
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEscRef.current < 500) {
          // Double-tap Escape -> rewind menu
          e.preventDefault();
          lastEscRef.current = 0;
          actionsRef.current.onRewindMenu?.();
          return;
        }
        lastEscRef.current = now;
        e.preventDefault();
        actionsRef.current.onDismiss?.();
        return;
      }

      // Skip remaining shortcuts when in input fields
      if (isInputField) return;

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

      // Ctrl+B / Cmd+B -> toggle task monitor
      if (isMod && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        actionsRef.current.onToggleMonitor?.();
        return;
      }

      // Alt+P -> model picker
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        actionsRef.current.onModelPicker?.();
        return;
      }

      // Alt+T -> toggle thinking visibility
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        actionsRef.current.onToggleThinking?.();
        return;
      }

      // Alt+O -> toggle fast mode
      if (e.altKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        actionsRef.current.onToggleFastMode?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
