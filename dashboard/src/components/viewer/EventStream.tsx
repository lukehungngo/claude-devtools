import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  ProgressEvent,
  ContentItem,
  ToolUseContent,
  ToolResultContent,
} from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ResponseBlock } from "./ResponseBlock";
import { ErrorBlock } from "./ErrorBlock";

interface EventStreamProps {
  events: SessionEvent[];
}

// ─── Aggregation ──────────────────────────────────────────────────────

interface AggregatedEvent {
  event: SessionEvent;
  count: number;
}

/** Collapse consecutive progress events with the same label into a single entry */
function aggregateProgressEvents(events: SessionEvent[]): AggregatedEvent[] {
  const result: AggregatedEvent[] = [];
  for (const event of events) {
    if (event.type === "progress") {
      const label =
        event.data?.hookName || event.data?.type || "progress";
      const prev = result[result.length - 1];
      if (prev && prev.event.type === "progress") {
        const prevProgress = prev.event as ProgressEvent;
        const prevLabel =
          prevProgress.data?.hookName ||
          prevProgress.data?.type ||
          "progress";
        if (prevLabel === label) {
          prev.count++;
          continue;
        }
      }
    }
    result.push({ event, count: 1 });
  }
  return result;
}

// ─── Render helpers ───────────────────────────────────────────────────

/** Build a map of tool_use_id -> ToolResultContent across all user events */
function buildToolResultMap(events: SessionEvent[]): Map<string, ToolResultContent> {
  const map = new Map<string, ToolResultContent>();
  for (const event of events) {
    if (event.type === "user") {
      for (const item of normalizeContent(event.message?.content)) {
        if (item.type === "tool_result") {
          map.set(item.tool_use_id, item);
        }
      }
    }
  }
  return map;
}

function renderUserEvent(event: UserEvent) {
  // Render error tool results
  const errorBlocks: React.ReactNode[] = [];
  const normalized = normalizeContent(event.message?.content);
  for (const item of normalized) {
    if (item.type === "tool_result" && item.is_error && item.content) {
      errorBlocks.push(
        <ErrorBlock
          key={`error-${event.uuid}-${item.tool_use_id}`}
          message={typeof item.content === "string" ? item.content : JSON.stringify(item.content)}
        />
      );
    }
  }

  // Extract text content from user message
  const textParts: string[] = [];
  for (const item of normalized) {
    if (item.type === "text" && item.text) {
      textParts.push(item.text);
    }
  }

  // Skip internal user events that are just tool results (unless they have errors)
  if (textParts.length === 0 && event.userType === "internal" && errorBlocks.length === 0) {
    return null;
  }

  // Skip if only tool_result content (unless they have errors)
  const hasOnlyToolResults = normalized.every(
    (c: ContentItem) => c.type === "tool_result"
  );
  if (hasOnlyToolResults && errorBlocks.length === 0) return null;

  // If we only have error blocks, render them
  if (textParts.length === 0 && errorBlocks.length > 0) {
    return (
      <div key={event.uuid} className="mb-1.5">
        {errorBlocks}
      </div>
    );
  }

  const displayText = textParts.join("\n");
  if (!displayText.trim()) return null;

  return (
    <div
      key={event.uuid}
      className="flex gap-0 mb-0.5 mt-3"
    >
      <span
        className="text-dt-accent whitespace-pre select-none font-mono text-sm"
      >
        {"\u276F"}{" "}
      </span>
      <span
        className="text-dt-text0 font-mono text-sm leading-[1.6] break-words"
      >
        {displayText}
      </span>
    </div>
  );
}

function renderAssistantEvent(
  event: AssistantEvent,
  toolResultMap: Map<string, ToolResultContent>
) {
  const normalizedItems = normalizeContent(event.message?.content);
  if (normalizedItems.length === 0) return null;

  const blocks: React.ReactNode[] = [];

  for (const item of normalizedItems) {
    switch (item.type) {
      case "thinking":
        blocks.push(<ThinkingBlock key={`think-${event.uuid}-${blocks.length}`} content={item} />);
        break;
      case "tool_use": {
        const toolUse = item as ToolUseContent;
        const toolResult = toolResultMap.get(toolUse.id);
        blocks.push(
          <ToolCallBlock
            key={`tool-${toolUse.id}`}
            toolUse={toolUse}
            toolResult={toolResult}
          />
        );
        break;
      }
      case "text":
        if ((item.text || "").trim()) {
          blocks.push(
            <ResponseBlock key={`text-${event.uuid}-${blocks.length}`} text={item.text || ""} />
          );
        }
        break;
      default:
        break;
    }
  }

  if (blocks.length === 0) return null;

  return (
    <div key={event.uuid} className="mb-1.5">
      {blocks}
    </div>
  );
}

function renderProgressEvent(event: ProgressEvent, count: number) {
  const label = event.data?.hookName || event.data?.type || "progress";

  return (
    <div
      key={event.uuid}
      className="text-dt-text2 font-mono text-xs mb-0.5 opacity-70"
    >
      {"\u2026"} {label}
      {event.data?.command && (
        <span className="ml-1.5 text-dt-text2">
          {event.data.command}
        </span>
      )}
      {count > 1 && (
        <span className="ml-1.5 text-xxs text-dt-accent font-semibold">
          x{count}
        </span>
      )}
    </div>
  );
}

const MAX_VISIBLE = 500;

export function EventStream({ events }: EventStreamProps) {
  const toolResultMap = buildToolResultMap(events);
  const truncated = events.length > MAX_VISIBLE;
  const visibleEvents = truncated
    ? events.slice(events.length - MAX_VISIBLE)
    : events;

  const aggregated = aggregateProgressEvents(visibleEvents);

  return (
    <div className="font-mono text-sm leading-[1.6]">
      {truncated && (
        <div className="py-1.5 text-center text-xxs text-dt-text2 border-b border-dt-border mb-2">
          Showing last {MAX_VISIBLE} of {events.length} events
        </div>
      )}
      {aggregated.map(({ event, count }) => {
        switch (event.type) {
          case "user":
            return renderUserEvent(event);
          case "assistant":
            return renderAssistantEvent(event, toolResultMap);
          case "progress":
            return renderProgressEvent(event, count);
          case "queue-operation":
            // Typically not displayed
            return null;
          default:
            return null;
        }
      })}
    </div>
  );
}
