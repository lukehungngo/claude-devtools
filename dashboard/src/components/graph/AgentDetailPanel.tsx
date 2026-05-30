import { useRef, useEffect, useCallback, memo } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAgentLogs } from "../../hooks/useAgentLogs";
import { meaningfulLogLines, logLineText } from "../../lib/logLines";
import { markdownComponents } from "../../lib/markdownComponents";
import type { AgentLogEntry } from "../../lib/types";

gsap.registerPlugin(useGSAP);

export interface AgentDetailPanelProps {
  projectHash: string;
  sessionId: string;
  agentId: string | null;
  /** Bumped by the live event stream — drives realtime refetch of the log. */
  liveEventCount?: number;
  /** Whether the selected agent is currently running (shows a live indicator). */
  live?: boolean;
}

/** Event-type → chip classes. Color + the label together convey the type. */
const EVENT_CHIP: Record<string, string> = {
  assistant: "bg-dt-accent-dim text-dt-accent",
  user: "bg-dt-bg3 text-dt-text1",
  progress: "bg-dt-yellow-dim text-dt-yellow",
  "queue-operation": "bg-dt-bg3 text-dt-text2",
};

function chipClass(eventType: string): string {
  return EVENT_CHIP[eventType] ?? "bg-dt-bg3 text-dt-text2";
}

/** HH:MM:SS for a log line; empty string on an invalid timestamp. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour12: false });
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * One log entry rendered as formatted markdown (tables, bold, code, lists) via
 * the shared markdownComponents — so the agent's output is human-readable
 * instead of raw `**asterisks**` and `|pipes|`. Memoized so a live append only
 * renders the new lines (existing lines never re-parse markdown).
 */
const LogLine = memo(function LogLine({ entry }: { entry: AgentLogEntry }) {
  return (
    <div
      data-log-line=""
      data-testid="agent-detail-line"
      className="flex flex-col gap-1.5 py-3 border-b border-dt-border-subtle last:border-b-0"
    >
      <span className="flex items-center gap-2">
        <span
          className={[
            "shrink-0 px-2 py-0.5 rounded-dt-xs text-xs font-mono font-semibold uppercase tracking-[0.3px]",
            chipClass(entry.eventType),
          ].join(" ")}
        >
          {entry.eventType}
        </span>
        <span className="text-xs font-mono tabular-nums text-dt-text2">{formatTime(entry.timestamp)}</span>
      </span>
      {/* Rendered markdown. overflow-x-auto keeps a wide table/code block from
          breaking the narrow panel; trailing block margins are trimmed. */}
      <div className="text-lg leading-[1.65] text-dt-text1 break-words overflow-x-auto dt-scrollbar [&>*:last-child]:mb-0 [&_pre]:text-md [&_pre_code]:text-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {logLineText(entry)}
        </ReactMarkdown>
      </div>
    </div>
  );
});

export function AgentDetailPanel({
  projectHash,
  sessionId,
  agentId,
  liveEventCount,
  live = false,
}: AgentDetailPanelProps) {
  // useAgentLogs treats a falsy agentId as "no agent" and skips the fetch.
  const { logs, loading } = useAgentLogs(projectHash, sessionId, agentId ?? "", liveEventCount);
  const lines = meaningfulLogLines(logs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  // GSAP bookkeeping: animate only newly-appended lines (not the whole list).
  const prevCountRef = useRef(0);
  const prevAgentRef = useRef<string | null>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }, []);

  // Realtime tail: keep pinned to the bottom when new lines arrive and the user
  // was already near the bottom (don't yank them up if they scrolled back).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const agentChanged = prevAgentRef.current !== agentId;
    if (agentChanged || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length, agentId]);

  // GSAP: stream newly-appended lines in (fade + slide up). Only the live
  // delta is animated — never the initial bulk load (an agent change) and
  // never a large jump, so a 900-line log doesn't fade in over 30s.
  const MAX_ANIMATED = 12;
  useGSAP(
    () => {
      const agentChanged = prevAgentRef.current !== agentId;
      prevAgentRef.current = agentId;
      const start = prevCountRef.current;
      prevCountRef.current = lines.length;
      if (agentChanged || prefersReducedMotion()) return; // bulk load → show instantly
      const root = listRef.current;
      if (!root) return;
      const lineEls = Array.from(root.querySelectorAll<HTMLElement>("[data-log-line]"));
      const fresh = lineEls.slice(start);
      if (fresh.length === 0 || fresh.length > MAX_ANIMATED) return; // big jump → no stagger
      gsap.from(fresh, { opacity: 0, y: 8, duration: 0.25, stagger: 0.03, ease: "power2.out" });
    },
    { dependencies: [lines.length, agentId], scope: listRef },
  );

  if (agentId === null) {
    return (
      <div
        data-testid="agent-detail-empty"
        className="flex items-center justify-center h-full text-dt-text2 text-md font-mono px-6 text-center"
      >
        Select an agent to see its live log
      </div>
    );
  }

  const agentLabel = agentId === "main" ? "main" : agentId.slice(0, 8);

  return (
    <div data-testid="agent-detail-panel" className="flex flex-col h-full overflow-hidden">
      {/* Header: agent + live indicator + line count */}
      <div className="px-4 py-2.5 border-b border-dt-border shrink-0 flex items-center gap-2">
        <span className="text-lg font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
          Agent {agentLabel}
        </span>
        {live && (
          <span className="inline-flex items-center gap-1" data-testid="agent-detail-live">
            <span className="w-1.5 h-1.5 rounded-full bg-dt-green animate-pulse-opacity motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.4px] text-dt-green">live</span>
          </span>
        )}
        <span className="ml-auto text-md font-mono tabular-nums text-dt-text2">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
      </div>

      {/* Full, realtime log — scrollable, tails the bottom */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto px-4 py-2 dt-scrollbar"
      >
        {loading && lines.length === 0 ? (
          <div className="text-md font-mono text-dt-text2 py-2">Loading…</div>
        ) : lines.length === 0 ? (
          <div className="text-md font-mono text-dt-text2 py-2">No log output yet</div>
        ) : (
          <div ref={listRef} className="flex flex-col">
            {lines.map((line) => (
              <LogLine key={line.uuid} entry={line} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
