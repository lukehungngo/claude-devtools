import { useState, useRef, useCallback } from "react";

const HISTORY_KEY = "promptHistory";
const HISTORY_MAX = 50;

function loadHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");

  const addToHistory = useCallback((entry: string) => {
    setHistory((prev) => {
      const next = [...prev, entry];
      const trimmed = next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
      saveHistory(trimmed);
      return trimmed;
    });
    setHistoryIndex(-1);
    draftRef.current = "";
  }, []);

  const navigateUp = useCallback((currentPrompt: string): string | null => {
    if (history.length === 0) return null;

    if (historyIndex === -1) {
      draftRef.current = currentPrompt;
    }

    const newIndex = historyIndex === -1
      ? history.length - 1
      : Math.max(0, historyIndex - 1);

    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndex === -1) return null;

    const newIndex = historyIndex + 1;
    if (newIndex >= history.length) {
      setHistoryIndex(-1);
      return draftRef.current;
    }

    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1);
    draftRef.current = "";
  }, []);

  return {
    history,
    historyIndex,
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
  };
}
