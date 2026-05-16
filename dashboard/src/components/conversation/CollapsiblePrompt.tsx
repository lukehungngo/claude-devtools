import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { classifyPrompt, TRIGGER_TOKENS } from "../../lib/promptClassifier";
import type { PromptType } from "../../lib/promptClassifier";

interface CollapsiblePromptProps {
  text: string;
}

function getPillClasses(command: string): string {
  const base = "font-mono text-[11px] font-semibold px-2 py-0.5 rounded inline-block";
  if (TRIGGER_TOKENS.has(command)) {
    // Nav token — amber highlight
    return `${base} bg-[var(--amb-dim)] text-[var(--amb)]`;
  }
  if (command.startsWith("/")) {
    // Slash command — blue highlight
    return `${base} bg-[var(--blue-dim)] text-[var(--blue)]`;
  }
  // Bash (!) or other — neutral highlight
  return `${base} bg-[var(--bg-h)] text-[var(--t1)]`;
}

function CommandPill({ command, args }: { command: string; args: string }) {
  return (
    <span>
      <span data-testid="command-pill" className={getPillClasses(command)}>
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

function ExpandToggle({
  isExpanded,
  label,
  onToggle,
}: {
  isExpanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  return (
    <button
      data-testid="expand-toggle"
      className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[var(--blue)] cursor-pointer bg-transparent border-none p-0 hover:underline"
      onClick={onToggle}
    >
      <Icon size={12} />
      {isExpanded ? "collapse" : label}
    </button>
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
        <ExpandToggle
          isExpanded={isExpanded}
          label={`+${remaining} more tasks`}
          onToggle={() => setIsExpanded((prev) => !prev)}
        />
      )}
    </div>
  );
}

function IntentBlobRenderer({
  intent,
  blob,
  blobType,
  blobLines,
  fullText,
}: {
  intent: string;
  blob: string;
  blobType: string;
  blobLines: number;
  fullText: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = blobType
    ? `+${blobLines} lines of ${blobType}`
    : `+${blobLines} lines`;

  return (
    <div>
      {!isExpanded && <div data-testid="intent-line">{intent}</div>}
      <ExpandToggle
        isExpanded={isExpanded}
        label={label}
        onToggle={() => setIsExpanded((prev) => !prev)}
      />
      {isExpanded && (
        <pre
          data-testid="blob-content"
          className="mt-1 px-2.5 py-2 bg-[var(--bg-h)] border border-[var(--bd)] rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--t2)] whitespace-pre-wrap max-h-[320px] overflow-y-auto"
        >
          {fullText}
        </pre>
      )}
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
        <ExpandToggle
          isExpanded={isExpanded}
          label={`+${remainingLines} lines`}
          onToggle={() => setIsExpanded((prev) => !prev)}
        />
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
          fullText={text}
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
