/**
 * Known harmless stderr warning patterns from Claude CLI.
 * These are filtered out to avoid cluttering the command output.
 */
const IGNORED_STDERR_PATTERNS = [
  "no stdin data received",
  "redirect stdin explicitly",
];

/**
 * Returns true if the stderr text is a known harmless warning
 * that should be suppressed from display.
 */
export function isIgnoredStderrWarning(text: string): boolean {
  return IGNORED_STDERR_PATTERNS.some((pattern) => text.includes(pattern));
}
