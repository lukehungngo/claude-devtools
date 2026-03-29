import { normalizeContent } from "./normalizeContent";
import type { SessionEvent, UserEvent, AssistantEvent, ContentItem } from "./types";

/**
 * Extract text from a user event's content.
 */
function extractUserText(event: UserEvent): string {
  const items = normalizeContent(event.message?.content);
  return items
    .filter((item): item is { type: "text"; text: string } => item.type === "text" && "text" in item)
    .map((item) => item.text)
    .join("\n");
}

/**
 * Extract text and tool calls from an assistant event's content.
 */
function extractAssistantContent(event: AssistantEvent): { text: string; tools: string[] } {
  const items = normalizeContent(event.message?.content);
  const textParts: string[] = [];
  const tools: string[] = [];

  for (const item of items) {
    if (item.type === "text" && "text" in item) {
      textParts.push((item as { type: "text"; text: string }).text);
    } else if (item.type === "tool_use" && "name" in item) {
      tools.push((item as { type: "tool_use"; name: string }).name);
    }
  }

  return { text: textParts.join("\n"), tools };
}

/**
 * Generate a Markdown export of the session conversation.
 *
 * Groups user/assistant events into turns and formats them as readable markdown.
 */
export function generateMarkdownExport(
  events: SessionEvent[],
  sessionId: string
): string {
  const lines: string[] = [];
  lines.push(`# Session Export: ${sessionId}\n`);

  let turnNumber = 0;
  let i = 0;

  while (i < events.length) {
    const event = events[i];

    // Look for user events to start a turn
    if (event.type === "user") {
      const userEvent = event as UserEvent;
      // Only count external user events as turn boundaries
      if (userEvent.userType === "external" || userEvent.userType === undefined) {
        turnNumber++;
        const userText = extractUserText(userEvent);
        lines.push(`---\n`);
        lines.push(`## Turn ${turnNumber}\n`);
        lines.push(`**User:**\n${userText}\n`);

        // Collect assistant responses that follow this user event
        let j = i + 1;
        while (j < events.length && events[j].type !== "user") {
          if (events[j].type === "assistant") {
            const assistantEvent = events[j] as AssistantEvent;
            const { text, tools } = extractAssistantContent(assistantEvent);
            if (text) {
              lines.push(`**Assistant:**\n${text}\n`);
            }
            for (const tool of tools) {
              lines.push(`### Tool: ${tool}\n`);
            }
          }
          j++;
        }
        i = j;
        continue;
      }
    }
    i++;
  }

  return lines.join("\n");
}

/**
 * Generate a JSON export of the session.
 *
 * Includes all events with their full structure for programmatic consumption.
 */
export function generateJsonExport(
  events: SessionEvent[],
  sessionId: string
): string {
  const exportData = {
    sessionId,
    exportedAt: new Date().toISOString(),
    events,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Trigger a browser file download from a string.
 */
export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
