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

export type KeyAction =
  | "clear"
  | "compact"
  | "dismiss"
  | "toggleTasks"
  | "toggleMonitor"
  | "toggleSearch"
  | "modelPicker"
  | "toggleThinking"
  | "toggleFastMode"
  | "rewindMenu";

export const DEFAULT_KEYBINDINGS: Record<KeyAction, string> = {
  clear: "Mod+l",
  compact: "Mod+Shift+k",
  dismiss: "Escape",
  toggleTasks: "Mod+t",
  toggleMonitor: "Mod+b",
  toggleSearch: "Mod+f",
  modelPicker: "Alt+p",
  toggleThinking: "Alt+t",
  toggleFastMode: "Alt+o",
  rewindMenu: "Escape Escape",
};

/**
 * Check whether a KeyboardEvent matches a binding string like "Mod+Shift+k".
 * "Mod" maps to Ctrl on Windows/Linux and Cmd on Mac.
 */
function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");
  const isMod = e.ctrlKey || e.metaKey;

  if (needsMod !== isMod) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;

  return e.key.toLowerCase() === key;
}

/**
 * Registers global keyboard shortcuts for the conversation view.
 *
 * Shortcuts (defaults, overridable via customBindings):
 * - Mod+L         -> onClear
 * - Mod+Shift+K   -> onCompact
 * - Mod+T         -> onToggleTasks
 * - Mod+B         -> onToggleMonitor
 * - Mod+F         -> onToggleSearch
 * - Alt+P         -> onModelPicker
 * - Alt+T         -> onToggleThinking
 * - Alt+O         -> onToggleFastMode
 * - Esc Esc       -> onRewindMenu  (double-tap within 500ms)
 * - Escape        -> onDismiss
 *
 * Shortcuts are ignored when the active element is an input, textarea,
 * or contentEditable element (except toggleSearch and Escape/dismiss).
 */
export function useKeyboardShortcuts(
  actions: ShortcutActions,
  customBindings?: Partial<Record<KeyAction, string>>,
): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const bindingsRef = useRef(customBindings);
  bindingsRef.current = customBindings;

  const lastEscRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const isInputField =
        target &&
        (target.tagName?.toLowerCase() === "input" ||
          target.tagName?.toLowerCase() === "textarea" ||
          target.isContentEditable);

      const bindings = { ...DEFAULT_KEYBINDINGS, ...bindingsRef.current };

      // toggleSearch works everywhere (including inputs) — overrides browser find
      if (matchesBinding(e, bindings.toggleSearch)) {
        e.preventDefault();
        actionsRef.current.onToggleSearch?.();
        return;
      }

      // Escape / double-tap Escape — works everywhere
      // The rewindMenu binding may be a chord like "Escape Escape" (space-separated).
      const isDoubleTapChord = bindings.rewindMenu.includes(" ");
      if (matchesBinding(e, bindings.dismiss)) {
        if (isDoubleTapChord) {
          const now = Date.now();
          if (now - lastEscRef.current < 500) {
            // Double-tap -> rewind menu
            e.preventDefault();
            lastEscRef.current = 0;
            actionsRef.current.onRewindMenu?.();
            return;
          }
          lastEscRef.current = now;
        }
        e.preventDefault();
        actionsRef.current.onDismiss?.();
        return;
      }

      // Skip remaining shortcuts when in input fields
      if (isInputField) return;

      // Standard action bindings (not active in input fields)
      const actionCallbacks: Array<[KeyAction, (() => void) | undefined]> = [
        ["clear", actionsRef.current.onClear],
        ["compact", actionsRef.current.onCompact],
        ["toggleTasks", actionsRef.current.onToggleTasks],
        ["toggleMonitor", actionsRef.current.onToggleMonitor],
        ["modelPicker", actionsRef.current.onModelPicker],
        ["toggleThinking", actionsRef.current.onToggleThinking],
        ["toggleFastMode", actionsRef.current.onToggleFastMode],
      ];

      for (const [action, callback] of actionCallbacks) {
        if (callback && matchesBinding(e, bindings[action])) {
          e.preventDefault();
          callback();
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
