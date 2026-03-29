import { useState, useRef, useCallback, useEffect } from "react";
import { isIgnoredStderrWarning } from "../../lib/filterStderrWarnings";

interface PromptInputProps {
  sessionCwd?: string;
  sessionId?: string;
  projectHash?: string;
  activeSessionId?: string;
  onSessionStarted?: (sessionId: string) => void;
}

const SLASH_COMMANDS = [
  { name: "/help",    description: "Show available commands" },
  { name: "/clear",   description: "Clear context (starts new session)" },
  { name: "/compact", description: "Compact the conversation context" },
  { name: "/cost",    description: "Show session cost summary" },
  { name: "/model",   description: "Show current model info" },
  { name: "/exit",    description: "Exit the current session" },
] as const;

/** Commands that are forwarded to the server rather than handled client-side */
const SERVER_FORWARDED_COMMANDS = new Set(["/compact", "/clear"]);

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
      return "Available commands: /help, /clear, /compact, /cost, /model, /exit";
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

export function PromptInput({ sessionCwd, sessionId, projectHash, activeSessionId, onSessionStarted }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [sseStatus, setSseStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Client-side slash command handling
    const trimmed = currentPrompt.trimStart();
    if (trimmed.startsWith("/")) {
      const command = trimmed.split(/\s+/)[0];

      // /compact is sent as a message to the SDK (supports optional focus text)
      if (command === "/compact") {
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
              setSseStatus("idle");
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
      {commandOutput && (
        <div className="text-xs text-dt-text2 px-1 pt-1 font-mono">
          {commandOutput}
        </div>
      )}
    </div>
  );
}
