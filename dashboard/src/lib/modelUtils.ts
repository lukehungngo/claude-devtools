/** Strip the "claude-" prefix for compact display. e.g. "claude-sonnet-4-6" → "sonnet-4-6" */
export function shortModelName(model: string): string {
  return model.replace(/^claude-/, "");
}
