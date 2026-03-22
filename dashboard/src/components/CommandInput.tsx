import { useState, useRef } from "react";
import { Send } from "lucide-react";

export function CommandInput() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running) return;

    setRunning(true);
    setOutput([]);

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "stdout" || data.type === "stderr") {
              setOutput((prev) => [...prev, data.text]);
              outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-2">
      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 bg-gray-50 dark:bg-gray-900 rounded p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800"
      >
        {output.length === 0 ? (
          <span className="text-gray-400">
            Send a prompt to Claude Code...
          </span>
        ) : (
          output.map((line, i) => <span key={i}>{line}</span>)
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt..."
          disabled={running}
          className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-xs placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={running || !prompt.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Send size={12} />
          {running ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
