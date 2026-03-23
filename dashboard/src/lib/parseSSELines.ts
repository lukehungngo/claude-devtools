/**
 * Stateful SSE line parser that correctly handles chunk boundaries.
 * Accumulates partial lines across calls so that data split across
 * two ReadableStream chunks is reassembled before parsing.
 */
export function createSSELineParser() {
  let buffer = "";

  return function parseChunk(chunk: string): string[] {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete last line in buffer

    const results: string[] = [];
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "stdout" || data.type === "stderr") {
          results.push(data.text);
        }
      } catch {
        // ignore parse errors
      }
    }
    return results;
  };
}
