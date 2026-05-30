interface SuggestionContext {
  hasMessages: boolean;
  lastTurnHadError: boolean;
}

/**
 * Compute ghost text suggestion based on input state and conversation context.
 * Returns null when no suggestion should be shown.
 */
export function computeSuggestion(
  input: string,
  context: SuggestionContext,
): string | null {
  // No suggestion when input has content or starts with slash command
  if (input.length > 0) return null;

  if (!context.hasMessages) {
    return "Describe what you'd like to build...";
  }

  // C5 (Phase B): re-enabled. When the last turn ended with a tool_result
  // error, nudge the user toward fixing it instead of the generic "continue"
  // copy. Keeps the `lastTurnHadError` prop live rather than shipping it dead.
  if (context.lastTurnHadError) {
    return "Fix the error above";
  }

  return "Continue with next steps...";
}
