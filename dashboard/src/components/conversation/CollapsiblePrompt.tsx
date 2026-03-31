import { useState, useMemo } from "react";
import { classifyPrompt, TRIGGER_TOKENS } from "../../lib/promptClassifier";
import type { PromptType } from "../../lib/promptClassifier";

interface CollapsiblePromptProps {
  text: string;
}

const pillBase: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  display: "inline-block",
};

const toggleStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  color: "var(--blue)",
  cursor: "pointer",
  background: "none",
  border: "none",
  padding: 0,
};

const blobContentStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--bg3)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--mono)",
  fontSize: 11,
  color: "var(--t3)",
  whiteSpace: "pre-wrap",
  maxHeight: 160,
  overflowY: "auto",
};

function getPillStyle(command: string): React.CSSProperties {
  if (TRIGGER_TOKENS.has(command)) {
    // Nav token — amber
    return {
      ...pillBase,
      background: "var(--amb-dim)",
      color: "var(--amb)",
      border: "1px solid var(--amb-border)",
    };
  }
  if (command.startsWith("/")) {
    // Slash command — blue
    return {
      ...pillBase,
      background: "var(--blue-dim)",
      color: "var(--blue)",
      border: "1px solid var(--blue-border)",
    };
  }
  // Bash (!) or other — neutral
  return {
    ...pillBase,
    background: "var(--bg-h)",
    color: "var(--t1)",
  };
}

function CommandPill({ command, args }: { command: string; args: string }) {
  return (
    <span>
      <span data-testid="command-pill" style={getPillStyle(command)}>
        {command}
      </span>
      {args ? (
        <>
          {" "}
          <span data-testid="command-args">{args}</span>
        </>
      ) : null}
    </span>
  );
}

function TaskListRenderer({
  items,
  visibleCount,
}: {
  items: string[];
  visibleCount: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visible = isExpanded ? items : items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <div>
      <div data-testid="task-list">
        {visible.map((item, i) => (
          <div key={i}>
            {i + 1}. {item}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <span
          data-testid="expand-toggle"
          role="button"
          tabIndex={0}
          style={toggleStyle}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? "collapse" : `+${remaining} more tasks`}
        </span>
      )}
    </div>
  );
}

function IntentBlobRenderer({
  intent,
  blob,
  blobType,
  blobLines,
}: {
  intent: string;
  blob: string;
  blobType: string;
  blobLines: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = blobType
    ? `+${blobLines} lines of ${blobType}`
    : `+${blobLines} lines`;

  return (
    <div>
      <div>{intent}</div>
      <span
        data-testid="expand-toggle"
        role="button"
        tabIndex={0}
        style={toggleStyle}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {isExpanded ? "collapse" : label}
      </span>
      <div
        data-testid="blob-content"
        style={{ ...blobContentStyle, display: isExpanded ? "block" : "none" }}
      >
        {blob}
      </div>
    </div>
  );
}

function LongProseRenderer({
  visibleLines,
  remainingLines,
  fullText,
}: {
  visibleLines: string[];
  remainingLines: number;
  fullText: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <div data-testid="visible-lines">
        {isExpanded
          ? fullText
          : visibleLines.join("\n")}
      </div>
      {remainingLines > 0 && (
        <span
          data-testid="expand-toggle"
          role="button"
          tabIndex={0}
          style={toggleStyle}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? "collapse" : `+${remainingLines} lines`}
        </span>
      )}
    </div>
  );
}

function renderByType(classified: PromptType, text: string) {
  switch (classified.type) {
    case "command":
      return <CommandPill command={classified.command} args={classified.args} />;
    case "short_intent":
      return <span>{text}</span>;
    case "task_list":
      return (
        <TaskListRenderer
          items={classified.items}
          visibleCount={classified.visibleCount}
        />
      );
    case "intent_blob":
      return (
        <IntentBlobRenderer
          intent={classified.intent}
          blob={classified.blob}
          blobType={classified.blobType}
          blobLines={classified.blobLines}
        />
      );
    case "long_prose":
      return (
        <LongProseRenderer
          visibleLines={classified.visibleLines}
          remainingLines={classified.remainingLines}
          fullText={text}
        />
      );
  }
}

export function CollapsiblePrompt({ text }: CollapsiblePromptProps) {
  const classified = useMemo(() => classifyPrompt(text), [text]);

  return (
    <div data-testid="collapsible-prompt">
      {renderByType(classified, text)}
    </div>
  );
}
