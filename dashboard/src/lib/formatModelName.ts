/**
 * Formats a Claude model ID for display.
 * "claude-sonnet-4-6"         → "sonnet-4-6"
 * "claude-haiku-4-5-20251001" → "haiku-4-5"
 */
export function formatModelName(model: string): string {
  let name = model.startsWith("claude-") ? model.slice("claude-".length) : model;
  name = name.replace(/-\d{8}$/, "");
  return name;
}
