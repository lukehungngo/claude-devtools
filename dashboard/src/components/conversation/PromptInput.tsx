import { useState, useRef, useCallback, useEffect } from "react";
import { isIgnoredStderrWarning } from "../../lib/filterStderrWarnings";

interface PromptInputProps {
  sessionCwd?: string;
  sessionId?: string;
  activeSessionId?: string;
}

const SLASH_COMMANDS = [
  { name: "/help",    description: "Show available commands" },
  { name: "/clear",   description: "Clear the command output" },
  { name: "/compact", description: "Compact the conversation context" },
  { name: "/cost",    description: "Show session cost summary" },
  { name: "/model",   description: "Show current model info" },
  { name: "/exit",    description: "Exit the current session" },
] as const;

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
    case "/compact":
      return "Compact is handled automatically by Claude Code in the active session.";
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

export function PromptInput({ sessionCwd, sessionId, activeSessionId }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [sseStatus, setSseStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredCommands = getFilteredCommands(prompt);
  const dropdownVisible = filteredCommands.length > 0 && !dropdownDismissed;

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

    // Client-side slash command handling — all slash commands handled locally
    const trimmed = currentPrompt.trimStart();
    if (trimmed.startsWith("/")) {
      const command = trimmed.split(/\s+/)[0];
      showOutput(getCommandOutput(command));
      return;
    }

    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setSseStatus("streaming");
    try {
      // Determine which session to send the prompt to:
      // 1. If we have an activeSessionId (started/resumed from web UI), use the session API
      // 2. Otherwise, fall back to /api/command but do NOT resume a viewed session —
      //    that would inject events into a CLI-started session the user is only observing.
      let endpoint: string;
      let body: Record<string, unknown>;

      if (activeSessionId) {
        endpoint = `/api/sessions/${activeSessionId}/message`;
        body = { prompt: currentPrompt };
      } else {
        endpoint = "/api/command";
        // Only pass cwd, never sessionId — resuming a viewed CLI session from the
        // dashboard would send responses into that CLI conversation unexpectedly.
        body = { prompt: currentPrompt, cwd: sessionCwd };
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
            // Consume SSE events — real-time view shows them via WebSocket
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
      // Reset status after a brief delay for error visibility
      setTimeout(() => setSseStatus("idle"), 2000);
    }
  }

  function selectCommand(cmd: SlashCommand) {
    setPrompt(cmd.name + " ");
    setSelectedCmdIndex(-1);
    setDropdownDismissed(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
        <textarea
          ref={inputRef}
          value={prompt}
          rows={1}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSelectedCmdIndex(-1);
            setDropdownDismissed(false);
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
