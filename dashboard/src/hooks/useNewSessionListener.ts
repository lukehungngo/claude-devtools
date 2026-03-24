/**
 * Pure helper: parse a WebSocket message string and call onNewSession
 * if it represents a new-session event. Fails silently on malformed JSON.
 */
export function handleWsMessage(data: string, onNewSession: () => void): void {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as Record<string, unknown>).type === "new-session"
    ) {
      onNewSession();
    }
  } catch {
    // Malformed JSON — ignore
  }
}

/**
 * No-op hook — new-session events are now handled by useUnifiedWebSocket in App.tsx.
 * Kept for API compatibility; consumers should migrate to useUnifiedWebSocket.
 */
export function useNewSessionListener(_onNewSession: () => void): void {
  // No-op: new-session events are now handled by useUnifiedWebSocket in App.tsx
}
