import { useState, useRef, useCallback, useEffect } from "react";
import { isIgnoredStderrWarning } from "../../lib/filterStderrWarnings";

interface CommandDispatchProps {
  sessionCwd?: string;
  sessionId?: string;
}

export function CommandDispatch({ sessionCwd, sessionId }: CommandDispatchProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [lastSentPrompt, setLastSentPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [prompt, adjustHeight]);

  async function submitPrompt() {
    if (!prompt.trim() || running) return;

    const currentPrompt = prompt;
    setPrompt("");
    setLastSentPrompt(currentPrompt);
    setOutput([]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: planMode ? `[Plan mode] ${currentPrompt}` : currentPrompt,
          cwd: sessionCwd,
          sessionId: sessionId,
        }),
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
            if (data.type === "stdout") {
              setOutput((prev) => [...prev, data.text]);
            } else if (data.type === "stderr") {
              if (!isIgnoredStderrWarning(data.text as string)) {
                setOutput((prev) => [...prev, data.text]);
              }
            } else if (data.type === "done" && data.exitCode !== 0) {
              setOutput((prev) => [
                ...prev,
                `\nProcess exited with code ${data.exitCode}`,
              ]);
            } else if (data.type === "error") {
              setOutput((prev) => [
                ...prev,
                `\nError: ${data.message}`,
              ]);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setOutput((prev) => [...prev, "[Stopped]"]);
      } else {
        setOutput((prev) => [
          ...prev,
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        ]);
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex flex-col shrink-0 mx-3 my-2 rounded-dt border border-dt-border bg-dt-bg2 overflow-hidden">
      {/* Sent prompt display */}
      {lastSentPrompt && (
        <div
          className={`px-4 py-2 font-mono text-sm leading-[1.5] text-dt-text1 flex gap-2 items-start ${
            output.length > 0 || running ? "border-b border-dt-border" : ""
          }`}
        >
          <span className="text-dt-accent font-bold shrink-0 leading-[1.5]">
            {"\u276F"}
          </span>
          <span className="whitespace-pre-wrap break-words">
            {lastSentPrompt}
          </span>
          {running && (
            <span
              className="shrink-0 ml-auto inline-flex items-center gap-1.5 text-xxs text-dt-accent font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-dt-accent animate-pulse-opacity" />
              Running
            </span>
          )}
        </div>
      )}

      {/* Output area */}
      {output.length > 0 && (
        <div
          ref={outputRef}
          className="max-h-50 overflow-y-auto px-4 py-2 bg-dt-bg3 font-mono text-xs leading-[1.6] text-dt-text1 whitespace-pre-wrap break-words dt-scrollbar"
        >
          {output.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Textarea input */}
      <div
        className={`flex items-end gap-2 px-3 py-2.5 ${
          output.length > 0 || lastSentPrompt ? "border-t border-dt-border" : ""
        }`}
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a prompt to Claude Code..."
          disabled={running}
          rows={1}
          className="flex-1 min-h-11 max-h-50 resize-none bg-dt-bg3 border border-dt-border rounded-dt outline-none text-dt-text0 font-mono text-sm leading-[1.5] px-4 py-3 caret-dt-accent transition-colors focus:border-dt-accent"
        />
        <div className="flex gap-1 items-center pb-1">
          <button
            type="button"
            onClick={() => setPlanMode(!planMode)}
            className={`px-2 py-1 rounded-dt-sm border text-xxs cursor-pointer transition-all ${
              planMode
                ? "bg-dt-accent-dim border-dt-accent text-dt-accent"
                : "bg-dt-bg3 border-dt-border text-dt-text2"
            }`}
          >
            Plan
          </button>
          {running && (
            <button
              type="button"
              onClick={handleStop}
              className="px-2 py-1 rounded-dt-sm bg-dt-bg3 border border-dt-border text-dt-red text-xxs cursor-pointer transition-all"
            >
              {"\u25A0"} Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
