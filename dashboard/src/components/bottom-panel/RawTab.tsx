import { memo, useState, useCallback, useMemo } from "react";
import type { SessionEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";

export interface RawTabProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts.slice(11, 19);
  }
}

function summarizeEvent(event: SessionEvent): string {
  const time = formatTimestamp(event.timestamp);
  const type = event.type;
  const json = JSON.stringify(event);
  const preview = json.length > 60 ? json.slice(0, 60) + "..." : json;
  return `${time}  ${type}  ${preview}`;
}

function highlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span style="color:var(--acc)">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span style="color:var(--grn)">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:var(--amb)">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:var(--red)">$1</span>');
}

function RawTabInner({ turns, allEvents, activeTurnIndex }: RawTabProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  const activeTurn =
    activeTurnIndex !== null &&
    activeTurnIndex >= 0 &&
    activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const events = useMemo(
    () => (activeTurn ? getEventsForTurn(activeTurn, allEvents) : []),
    [activeTurn, allEvents],
  );

  const handleClick = useCallback((index: number) => {
    setSelectedEventIndex((prev) => (prev === index ? null : index));
  }, []);

  const highlightedJson = useMemo(() => {
    if (selectedEventIndex === null || selectedEventIndex >= events.length) return null;
    const raw = JSON.stringify(events[selectedEventIndex], null, 2);
    return highlightJson(raw);
  }, [events, selectedEventIndex]);

  if (!activeTurn) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100%", color: "var(--t3)", fontSize: 13 }}
      >
        Select a turn to see raw events
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ overflowY: "auto", flex: selectedEventIndex !== null ? "0 0 auto" : "1", maxHeight: selectedEventIndex !== null ? "40%" : "100%" }}>
        {events.map((event, i) => (
          <div
            key={event.uuid ?? i}
            data-testid="raw-event-row"
            onClick={() => handleClick(i)}
            style={{
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: selectedEventIndex === i ? "var(--bg-s)" : undefined,
              borderLeft: selectedEventIndex === i ? "2px solid var(--acc)" : "2px solid transparent",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--t2)",
            }}
          >
            {summarizeEvent(event)}
          </div>
        ))}
      </div>
      {highlightedJson !== null && (
        <div
          data-testid="raw-json-view"
          style={{
            flex: 1,
            padding: 12,
            background: "var(--bg-s)",
            overflow: "auto",
            borderTop: "1px solid var(--bd)",
          }}
        >
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
            dangerouslySetInnerHTML={{ __html: highlightedJson }}
          />
        </div>
      )}
    </div>
  );
}

export const RawTab = memo(RawTabInner);
