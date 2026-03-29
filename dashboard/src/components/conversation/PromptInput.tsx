import { useState, useRef, useCallback, useEffect, type ClipboardEvent as ReactClipboardEvent } from "react";
import { isIgnoredStderrWarning } from "../../lib/filterStderrWarnings";
import { formatCostCommand, formatUsageCommand, formatDiffCommand, formatMcpCommand, formatTasksCommand, formatAnalyticsCommand, formatContextCommand, formatPermissionsCommand } from "../../lib/commandFormatters";
import type { SessionMetrics, UsageInfo, CostSummary } from "../../lib/types";

interface ImageAttachment {
  type: "image";
  dataUrl: string;
  name: string;
}

const HISTORY_KEY = "promptHistory";
const HISTORY_MAX = 50;

function loadHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

interface PromptInputProps {
  sessionCwd?: string;
  sessionId?: string;
  projectHash?: string;
  activeSessionId?: string;
  onSessionStarted?: (sessionId: string) => void;
  /** Returns the last N assistant response texts (most recent last). Used by /copy. */
  getAssistantResponses?: (count: number) => string[];
  /** Session metrics for /cost command */
  metrics?: SessionMetrics | null;
  /** Usage/rate limit info for /usage command */
  usage?: UsageInfo | null;
  /** Cross-session cost summary for /analytics command */
  costs?: CostSummary | null;
}

const SLASH_COMMANDS = [
  { name: "/help",    description: "Show available commands" },
  { name: "/clear",   description: "Clear context (starts new session)" },
  { name: "/compact", description: "Compact the conversation context" },
  { name: "/context", description: "Show context window usage" },
  { name: "/copy",    description: "Copy last assistant response(s) to clipboard" },
  { name: "/cost",    description: "Show session cost summary" },
  { name: "/diff",    description: "Show git diff (uncommitted changes)" },
  { name: "/effort",  description: "Set effort level (low | medium | high)" },
  { name: "/fast",    description: "Toggle fast mode (on | off)" },
  { name: "/mcp",     description: "Show connected MCP servers and tools" },
  { name: "/model",   description: "Show current model info" },
  { name: "/permissions", description: "Show permission mode and allowances" },
  { name: "/plan",    description: "Switch to plan mode (read-only)" },
  { name: "/rewind",  description: "Rewind conversation (optional: N turns)" },
  { name: "/tasks",     description: "Show task summary" },
  { name: "/analytics", description: "Show cross-session analytics" },
  { name: "/usage",   description: "Show rate limit utilization" },
  { name: "/exit",    description: "Exit the current session" },
] as const;

/** Commands that are forwarded to the server rather than handled client-side */
const SERVER_FORWARDED_COMMANDS = new Set(["/compact", "/clear", "/rewind"]);

/** Model name shortcuts for /model command */
const MODEL_SHORTCUTS: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

type SlashCommand = typeof SLASH_COMMANDS[number];

function getFilteredCommands(prompt: string): SlashCommand[] {
  const trimmed = prompt.trimStart();
  if (!trimmed.startsWith("/") || trimmed.includes(" ")) return [];
  const lower = trimmed.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(lower)
  ).slice(0, 8);
}

function getCommandOutput(command: string): string {
  switch (command) {
    case "/help":
      return "Available commands: /help, /clear, /compact, /context, /copy, /cost, /diff, /effort, /fast, /mcp, /model, /permissions, /plan, /rewind, /tasks, /analytics, /usage, /exit";
    case "/clear":
      return "";
    case "/cost":
      return "View session costs in the TopBar metrics.";
    case "/model":
      return "Model configuration is set in your Claude Code settings.";
    case "/exit":
      return "To exit, close this session or select another in the sidebar.";
    default:
      return `Unknown command: ${command}`;
  }
}

/**
 * Extract the @ mention prefix from text.
 * Returns the text after the last `@` if it looks like a file path mention,
 * or null if no active @ mention is detected.
 */
function getAtMentionPrefix(text: string): string | null {
  const lastAt = text.lastIndexOf("@");
  if (lastAt < 0) return null;
  // @ must be at start or preceded by a space
  if (lastAt > 0 && text[lastAt - 1] !== " ") return null;
  const after = text.slice(lastAt + 1);
  // If there's a space after the prefix, the mention is "closed"
  if (after.includes(" ")) return null;
  return after;
}

export function PromptInput({ sessionCwd, sessionId, projectHash, activeSessionId, onSessionStarted, getAssistantResponses, metrics, usage, costs }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);

  // Command history state (T2-07)
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");
  const [sseStatus, setSseStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [sseError, setSseError] = useState<string | null>(null);
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const outputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image attachment state (T2-15)
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);

  // @ file autocomplete state
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);
  const [fileDismissed, setFileDismissed] = useState(false);
  const fileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atPrefix = getAtMentionPrefix(prompt);
  const fileDropdownVisible = !fileDismissed && fileResults.length > 0 && atPrefix !== null;

  // Debounced file fetch when @ prefix changes
  useEffect(() => {
    if (atPrefix === null || !projectHash || !sessionId) {
      setFileResults([]);
      return;
    }

    if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
    fileDebounceRef.current = setTimeout(() => {
      const encoded = encodeURIComponent(atPrefix);
      fetch(`/api/sessions/${projectHash}/${sessionId}/files?prefix=${encoded}`)
        .then((r) => r.json())
        .then((data: { files?: string[] }) => {
          setFileResults(data.files ?? []);
          setSelectedFileIndex(-1);
        })
        .catch(() => {
          setFileResults([]);
        });
    }, 200);

    return () => {
      if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
    };
  }, [atPrefix, projectHash, sessionId]);

  const filteredCommands = getFilteredCommands(prompt);
  const dropdownVisible = filteredCommands.length > 0 && !dropdownDismissed && !fileDropdownVisible;

  const adjustFocus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!running) adjustFocus();
  }, [running, adjustFocus]);

  // Keep runningRef in sync with running state for the global keydown handler
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Global Ctrl+C handler to abort streaming (T2-11)
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "c" && runningRef.current) {
        abortRef.current?.abort();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function showOutput(msg: string) {
    if (outputTimeoutRef.current) clearTimeout(outputTimeoutRef.current);
    if (msg === "") {
      setCommandOutput(null);
      return;
    }
    setCommandOutput(msg);
    outputTimeoutRef.current = setTimeout(() => {
      setCommandOutput(null);
    }, 4000);
  }

  async function submitPrompt() {
    if (!prompt.trim() || running) return;

    const currentPrompt = prompt;
    setPrompt("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setSelectedCmdIndex(-1);
    setDropdownDismissed(false);
    setFileResults([]);
    setFileDismissed(false);
    const currentImages = [...imageAttachments];
    setImageAttachments([]);

    // Save to command history (T2-07)
    setHistory((prev) => {
      const next = [...prev, currentPrompt];
      const trimmed = next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
      saveHistory(trimmed);
      return trimmed;
    });
    setHistoryIndex(-1);
    draftRef.current = "";

    // Client-side slash command handling
    const trimmed = currentPrompt.trimStart();
    if (trimmed.startsWith("/")) {
      const command = trimmed.split(/\s+/)[0];

      // /compact and /rewind are sent as messages to the SDK (handled natively by Claude Code)
      if (command === "/compact" || command === "/rewind") {
        // Fall through to the message-sending path below
      } else if (command === "/clear") {
        try {
          const res = await fetch("/api/sessions/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cwd: sessionCwd || "/" }),
          });
          const data = await res.json();
          if (data.sessionId) {
            onSessionStarted?.(data.sessionId);
          }
        } catch {
          showOutput("Failed to start new session.");
        }
        return;
      } else if (command === "/copy") {
        const parts = trimmed.split(/\s+/);
        const countArg = parts[1] ? parseInt(parts[1], 10) : 1;
        const count = isNaN(countArg) || countArg < 1 ? 1 : countArg;

        if (!getAssistantResponses) {
          showOutput("No responses to copy.");
          return;
        }

        const responses = getAssistantResponses(count);
        if (responses.length === 0) {
          showOutput("No responses to copy.");
          return;
        }

        const text = responses.join("\n\n---\n\n");
        navigator.clipboard.writeText(text).then(
          () => showOutput(`Copied ${responses.length} response${responses.length !== 1 ? "s" : ""} to clipboard`),
          () => showOutput("Failed to copy to clipboard.")
        );
        return;
      } else if (command === "/cost") {
        showOutput(formatCostCommand(metrics ?? null));
        return;
      } else if (command === "/diff") {
        const result = await formatDiffCommand(projectHash, sessionId);
        showOutput(result);
        return;
      } else if (command === "/mcp") {
        showOutput(formatMcpCommand(metrics ?? null));
        return;
      } else if (command === "/context") {
        showOutput(formatContextCommand(metrics ?? null));
        return;
      } else if (command === "/permissions") {
        const targetId = activeSessionId || sessionId;
        if (!targetId) {
          showOutput(formatPermissionsCommand(null));
          return;
        }
        try {
          const res = await fetch(`/api/sessions/${targetId}/permissions-info`);
          const data = await res.json();
          showOutput(formatPermissionsCommand(data));
        } catch {
          showOutput(formatPermissionsCommand(null));
        }
        return;
      } else if (command === "/usage") {
        showOutput(formatUsageCommand(usage ?? null));
        return;
      } else if (command === "/fast") {
        const parts = trimmed.split(/\s+/);
        const arg = parts[1]?.toLowerCase();
        const targetId = activeSessionId || sessionId;

        if (!targetId) {
          showOutput("No active session. Start or resume a session first.");
          return;
        }

        // Determine enabled value: "on" -> true, "off" -> false, no arg -> toggle (send true as default)
        const enabled = arg === "off" ? false : true;

        try {
          const res = await fetch(`/api/sessions/${targetId}/fast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
          });
          const data = await res.json();
          if (data.success) {
            showOutput(`Fast mode ${data.fastMode ? "enabled" : "disabled"}`);
          } else {
            showOutput(`Failed to set fast mode: ${data.error || "unknown error"}`);
          }
        } catch {
          showOutput("Failed to set fast mode.");
        }
        return;
      } else if (command === "/effort") {
        const parts = trimmed.split(/\s+/);
        const levelArg = parts[1]?.toLowerCase();
        const validLevels = new Set(["low", "medium", "high"]);

        if (!levelArg) {
          showOutput("Usage: /effort low | medium | high (sets effort level for the session)");
          return;
        }

        if (!validLevels.has(levelArg)) {
          showOutput("Invalid effort level. Use: /effort low | medium | high");
          return;
        }

        const targetId = activeSessionId || sessionId;
        if (!targetId) {
          showOutput("No active session. Start or resume a session first.");
          return;
        }

        try {
          const res = await fetch(`/api/sessions/${targetId}/effort`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ level: levelArg }),
          });
          const data = await res.json();
          if (data.success) {
            showOutput(`Effort level set to ${data.effortLevel}`);
          } else {
            showOutput(`Failed to set effort level: ${data.error || "unknown error"}`);
          }
        } catch {
          showOutput("Failed to set effort level.");
        }
        return;
      } else if (command === "/plan") {
        const parts = trimmed.split(/\s+/);
        const arg = parts[1]?.toLowerCase();
        const targetId = activeSessionId || sessionId;

        if (!targetId) {
          showOutput("No active session. Start or resume a session first.");
          return;
        }

        const mode = arg === "off" ? "default" : "plan";

        try {
          const res = await fetch(`/api/sessions/${targetId}/permission-mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode }),
          });
          const data = await res.json();
          if (data.success) {
            const label = data.mode === "plan" ? "Plan" : "Default";
            showOutput(`Switched to ${label} mode${data.mode === "plan" ? " (read-only)" : ""}`);
          } else {
            showOutput(`Failed to switch mode: ${data.error || "unknown error"}`);
          }
        } catch {
          showOutput("Failed to switch permission mode.");
        }
        return;
      } else if (command === "/tasks") {
        showOutput(formatTasksCommand(metrics ?? null));
        return;
      } else if (command === "/analytics") {
        showOutput(formatAnalyticsCommand(costs ?? null));
        return;
      } else if (command === "/model") {
        const parts = trimmed.split(/\s+/);
        const modelArg = parts[1]?.trim();

        if (!modelArg) {
          showOutput("Current model: default (use /model opus|sonnet|haiku to switch)");
          return;
        }

        const resolvedModel = MODEL_SHORTCUTS[modelArg.toLowerCase()] || modelArg;
        const targetId = activeSessionId || sessionId;

        if (!targetId) {
          showOutput("No active session. Start or resume a session first.");
          return;
        }

        try {
          const res = await fetch(`/api/sessions/${targetId}/model`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: resolvedModel }),
          });
          const data = await res.json();
          if (data.success) {
            showOutput(`Model switched to ${data.model}`);
          } else {
            showOutput(`Failed to switch model: ${data.error || "unknown error"}`);
          }
        } catch {
          showOutput("Failed to switch model.");
        }
        return;
      } else {
        showOutput(getCommandOutput(command));
        return;
      }
    }

    setRunning(true);
    setSseError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    setSseStatus("streaming");
    try {
      let targetSessionId = activeSessionId;

      if (!targetSessionId && sessionId) {
        try {
          await fetch(`/api/sessions/${sessionId}/resume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cwd: sessionCwd }),
          });
          targetSessionId = sessionId;
          onSessionStarted?.(sessionId);
        } catch {
          console.error("Failed to resume session");
        }
      }

      if (!targetSessionId) {
        try {
          const newRes = await fetch("/api/sessions/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cwd: sessionCwd || "/" }),
          });
          const data = await newRes.json();
          targetSessionId = data.sessionId;
          if (targetSessionId) onSessionStarted?.(targetSessionId);
        } catch {
          console.error("Failed to start new session");
        }
      }

      if (!targetSessionId) {
        setSseStatus("error");
        setRunning(false);
        return;
      }

      const endpoint = `/api/sessions/${targetSessionId}/message`;
      const body: Record<string, unknown> = { prompt: currentPrompt };
      if (currentImages.length > 0) {
        body.images = currentImages.map((img) => ({
          dataUrl: img.dataUrl,
          name: img.name,
        }));
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "stderr" && isIgnoredStderrWarning(data.text as string)) {
              continue;
            }
            if (data.type === "result") {
              if (data.is_error || data.error) {
                const errorMsg = typeof data.error === "string"
                  ? data.error
                  : typeof data.result === "string"
                    ? data.result
                    : "An error occurred";
                setSseError(errorMsg);
                setSseStatus("error");
              } else {
                setSseStatus("idle");
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Command dispatch error:", err);
        setSseStatus("error");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setTimeout(() => setSseStatus("idle"), 2000);
    }
  }

  function selectCommand(cmd: SlashCommand) {
    setPrompt(cmd.name + " ");
    setSelectedCmdIndex(-1);
    setDropdownDismissed(false);
    inputRef.current?.focus();
  }

  function selectFile(filePath: string) {
    // Replace @prefix with @filePath in the prompt
    const lastAt = prompt.lastIndexOf("@");
    if (lastAt >= 0) {
      const before = prompt.slice(0, lastAt);
      setPrompt(before + "@" + filePath + " ");
    }
    setFileResults([]);
    setSelectedFileIndex(-1);
    setFileDismissed(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // File autocomplete keyboard navigation
    if (fileDropdownVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedFileIndex((prev) =>
          prev < fileResults.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedFileIndex((prev) =>
          prev > 0 ? prev - 1 : fileResults.length - 1
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const idx = selectedFileIndex >= 0 ? selectedFileIndex : 0;
        if (fileResults[idx]) {
          selectFile(fileResults[idx]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedFileIndex(-1);
        setFileDismissed(true);
        return;
      }
    }

    // Slash command keyboard navigation
    if (dropdownVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCmdIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCmdIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const trimmedPrompt = prompt.trimStart().toLowerCase();
        const exactMatch = filteredCommands.length === 1 &&
          filteredCommands[0].name.toLowerCase() === trimmedPrompt &&
          SERVER_FORWARDED_COMMANDS.has(filteredCommands[0].name);
        if (exactMatch && e.key === "Enter") {
          submitPrompt();
          return;
        }
        const idx = selectedCmdIndex >= 0 ? selectedCmdIndex : 0;
        if (filteredCommands[idx]) {
          selectCommand(filteredCommands[idx]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedCmdIndex(-1);
        setDropdownDismissed(true);
        return;
      }
    }

    // Command history navigation (T2-07)
    if (e.key === "ArrowUp" && !dropdownVisible && !fileDropdownVisible && history.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) {
        // Save current draft before entering history
        draftRef.current = prompt;
      }
      const newIndex = historyIndex === -1
        ? history.length - 1
        : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setPrompt(history[newIndex]);
      return;
    }

    if (e.key === "ArrowDown" && !dropdownVisible && !fileDropdownVisible && historyIndex !== -1) {
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        // Back to draft
        setHistoryIndex(-1);
        setPrompt(draftRef.current);
      } else {
        setHistoryIndex(newIndex);
        setPrompt(history[newIndex]);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handlePaste(e: ReactClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setImageAttachments((prev) => [
            ...prev,
            { type: "image", dataUrl, name: file.name || "pasted-image.png" },
          ]);
        };
        reader.readAsDataURL(file);
        break; // Only handle first image
      }
    }
  }

  function removeImageAttachment(index: number) {
    setImageAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="conv-input-wrap px-4 pt-2.5 pb-3.5 border-t border-dt-border bg-dt-bg1 shrink-0">
      <div className="conv-input-box relative flex items-center gap-2 bg-dt-bg2 border border-dt-border rounded-xl px-4 py-3 transition-colors">
        {/* Slash command dropdown */}
        {dropdownVisible && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-dt-bg3 border border-dt-border rounded-xl overflow-hidden shadow-lg z-50">
            {filteredCommands.map((cmd, i) => (
              <div
                key={cmd.name}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors ${
                  i === selectedCmdIndex ? "bg-dt-accent-dim" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCommand(cmd);
                }}
              >
                <span className="text-dt-accent font-mono font-semibold">{cmd.name}</span>
                <span className="text-dt-text2">{cmd.description}</span>
              </div>
            ))}
          </div>
        )}
        {/* File autocomplete dropdown */}
        {fileDropdownVisible && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-dt-bg3 border border-dt-border rounded-xl overflow-hidden shadow-lg z-50">
            {fileResults.map((file, i) => (
              <div
                key={file}
                data-testid="file-option"
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors ${
                  i === selectedFileIndex ? "bg-dt-accent-dim" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectFile(file);
                }}
              >
                <span className="text-dt-text1 font-mono">{file}</span>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={prompt}
          rows={1}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSelectedCmdIndex(-1);
            setDropdownDismissed(false);
            setFileDismissed(false);
            if (commandOutput) setCommandOutput(null);
          }}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder="Send a prompt to Claude Code..."
          disabled={running}
          className="flex-1 bg-transparent border-none outline-none text-dt-text0 font-mono text-lg caret-dt-accent resize-none overflow-hidden"
        />
        {/* SSE status indicator */}
        {running && sseStatus === "streaming" && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-dt-green animate-pulse-opacity shrink-0"
            title="Streaming response..."
          />
        )}
        {sseStatus === "error" && (
          <span className="text-xs text-dt-red font-semibold">
            Error
          </span>
        )}
        {running ? (
          <button
            onClick={handleStop}
            className="px-2.5 py-1 rounded-dt bg-dt-red-dim border-none text-dt-red text-base font-semibold cursor-pointer"
          >
            {"\u25A0"} Stop
          </button>
        ) : (
          <button
            onClick={submitPrompt}
            disabled={!prompt.trim()}
            className={`px-2.5 py-1 rounded-dt border-none text-base font-semibold transition-all ${
              prompt.trim()
                ? "bg-dt-accent text-white cursor-pointer"
                : "bg-dt-bg3 text-dt-text2 cursor-default"
            }`}
          >
            Send
          </button>
        )}
      </div>
      {imageAttachments.length > 0 && (
        <div className="flex gap-2 px-1 pt-1.5">
          {imageAttachments.map((img, idx) => (
            <div
              key={idx}
              data-testid="image-attachment-preview"
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded-dt bg-dt-bg2 border border-dt-border"
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-8 h-8 object-cover rounded"
              />
              <span className="text-xs text-dt-text2 font-mono truncate max-w-[120px]">
                {img.name}
              </span>
              <button
                data-testid="image-attachment-remove"
                onClick={() => removeImageAttachment(idx)}
                className="ml-1 text-dt-text2 hover:text-dt-red text-sm leading-none cursor-pointer bg-transparent border-none"
              >
                {"\u00D7"}
              </button>
            </div>
          ))}
        </div>
      )}
      {commandOutput && (
        <div className="text-xs text-dt-text2 px-1 pt-1 font-mono whitespace-pre-line">
          {commandOutput}
        </div>
      )}
      {sseError && (
        <div
          data-testid="sse-error-banner"
          className="flex items-center justify-between gap-2 mt-1 px-3 py-2 rounded-dt bg-dt-red-dim text-dt-red text-sm font-mono"
        >
          <span>{sseError}</span>
          <button
            data-testid="sse-error-dismiss"
            onClick={() => setSseError(null)}
            className="bg-none border-none text-dt-red cursor-pointer text-base px-1 shrink-0"
          >
            {"\u00D7"}
          </button>
        </div>
      )}
    </div>
  );
}
