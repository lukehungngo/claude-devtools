# Research Proposal: Command Dispatch SSE Streaming Not Rendering in Browser

## Round
1 of 3

## Problem Definition

The dashboard's CommandDispatch component sends prompts to the server's `/api/command` endpoint. The server spawns `claude -p <prompt>`, streams stdout/stderr as SSE events, and the browser should display them incrementally. **curl works perfectly** (both direct to server :3142 and through Vite proxy :5173), but the browser never shows the response text.

### What makes this hard

The previous fix (TASK-sse-bugfix) already:
1. Added Vite proxy `proxyRes` handler with `cache-control: no-cache` and `x-accel-buffering: no`
2. Switched from `fetch + ReadableStream` to `XHR + onprogress`

Both of these were reasonable fixes, yet the problem persists. The issue is in how browsers handle XHR `onprogress` for small SSE payloads -- a behavior that does not manifest in curl or Node.js HTTP clients.

## Evidence Gathered

### Test Results

| Test | Result |
|------|--------|
| `curl` direct to :3142 | PASS -- SSE events stream correctly, 2 chunks |
| `curl` through Vite proxy :5173 | PASS -- SSE events stream correctly, headers correct |
| Node.js HTTP client through proxy | PASS -- 2 separate chunks, parsing works |
| Server response headers | Correct: `text/event-stream`, `no-cache`, `keep-alive`, `x-accel-buffering: no` |
| Proxy chunk delivery | NOT buffered -- 2 distinct chunks delivered |

### Server Code Analysis (routes.ts:197-244)

The server correctly:
- Spawns `claude -p <prompt>` with `child.stdin.end()`
- Sets SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Streams stdout/stderr as `data: {...}\n\n` SSE events
- Sends `done` event on child close

**Missing: `res.flushHeaders()`** -- headers are not explicitly flushed before streaming begins. While this doesn't affect curl (which handles chunked encoding natively), it may affect browser timing expectations.

### Frontend Code Analysis (CommandDispatch.tsx)

Uses `XMLHttpRequest` with:
- `xhr.onprogress` to parse SSE events incrementally
- `xhr.onloadend` to set `running = false`
- SSE parsing: `split("\n")` then filter `"data: "` prefix, then `JSON.parse`

**Critical gap**: `onloadend` does NOT parse the response. Only `onprogress` parses it. If `onprogress` never fires (or fires with empty `responseText`), the output is never populated.

## Root Cause Analysis

### Most Likely: Chrome 2KB XHR Buffer Threshold (confidence: ~70%)

Chrome historically does not fire XHR `onprogress` events until at least 2048 bytes of response data have been received. The typical `claude -p "say hi"` response is ~180 bytes total -- well under this threshold.

Per the XHR spec, a final `progress` event should fire before `load` even for small responses. However, browser implementations may deviate. If Chrome defers `onprogress` for sub-2KB responses and jumps directly to `onload` -> `onloadend`, the parsing code in `onprogress` never executes.

**Evidence for**: The response is consistently under 2KB. The 51Degrees article documents this Chrome behavior. The 2KB padding workaround is a well-known technique.

**Evidence against**: The XHR spec mandates a final `progress` event. Modern Chrome (2025+) may have changed this behavior. Without direct browser DevTools testing, this is estimated.

### Alternative: Missing `res.flushHeaders()` (confidence: ~20%)

Express may not send the response headers to the proxy until a sufficient amount of data is buffered. Without `flushHeaders()`, the browser may not know the response is `text/event-stream` until the response completes, causing it to buffer everything and process it as a regular response.

However, curl through the proxy works fine, which suggests headers ARE being sent promptly -- just possibly not soon enough for the browser's XHR implementation.

### Alternative: React 18 Batching Interaction (confidence: ~10%)

React 18's automatic batching might group the `setOutput` calls from `onprogress` with the `setRunning(false)` from `onloadend`, causing a rendering issue where the output div is never shown because `running` transitions to false before `output` is rendered. This is unlikely because `onprogress` fires before `onloadend` per spec, and React batches within the same microtask, not across event callbacks.

## Proposed Approach: Replace XHR with `fetch` + `ReadableStream.getReader()`

### Why

The `fetch` API with `response.body.getReader()` provides true streaming without Chrome's 2KB buffer limitation. Each chunk is delivered as soon as the network layer receives it. This is the standard modern approach used by ChatGPT, Claude.ai, and virtually all LLM streaming UIs.

The previous TASK-sse-bugfix switched AWAY from fetch claiming it was "unreliable through proxies." However, the proxy configuration is now correct (headers are set properly), and the real issue was likely that the original fetch implementation had a different bug. The proxy itself delivers chunks correctly (verified via Node.js HTTP client test).

### Pseudocode

```typescript
async function submitPrompt() {
  if (!prompt.trim() || running) return;

  setOutput([]);
  setRunning(true);

  const abortController = new AbortController();
  abortRef.current = abortController;

  try {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, cwd: sessionCwd }),
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      setOutput(["Error: " + response.statusText]);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events from buffer
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? ""; // keep incomplete event in buffer

      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "stdout") {
            setOutput(prev => [...prev, data.text]);
          } else if (data.type === "stderr") {
            if (!isIgnoredStderrWarning(data.text)) {
              setOutput(prev => [...prev, data.text]);
            }
          } else if (data.type === "done" && data.exitCode !== 0) {
            setOutput(prev => [...prev, `\nProcess exited with code ${data.exitCode}`]);
          } else if (data.type === "error") {
            setOutput(prev => [...prev, `\nError: ${data.message}`]);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      setOutput(prev => [...prev, "Error: Connection failed"]);
    }
  } finally {
    abortRef.current = null;
    setRunning(false);
  }
}
```

### Key improvements over current XHR approach

1. **No 2KB buffer threshold** -- `reader.read()` delivers chunks as they arrive
2. **Proper SSE parsing** -- splits on `\n\n` (double newline = SSE event boundary) instead of `\n` (single newline), which is more correct per SSE spec
3. **Buffer management** -- keeps partial events in a buffer for cross-chunk parsing
4. **AbortController for cancellation** -- cleaner than `xhr.abort()`
5. **Error handling** -- distinguishes abort from network errors

### Server-side addition: `res.flushHeaders()`

Add `res.flushHeaders()` after setting SSE headers in the command route. This ensures the browser receives the response headers immediately, allowing the ReadableStream to begin processing chunks without waiting for the first data write.

```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.flushHeaders(); // <-- ADD THIS
```

## Trade-off Analysis

| Approach | Pros | Cons | Complexity |
|----------|------|------|-----------|
| **fetch + ReadableStream** (proposed) | Modern API, no 2KB issue, true streaming, AbortController, proper SSE buffering | Requires async function, slightly more code | Low -- well-understood pattern |
| **XHR + 2KB padding** | Minimal change, keeps existing code | Hacky workaround, wastes bandwidth, fragile | Low but ugly |
| **EventSource** | Built-in SSE parsing, auto-reconnect | GET-only (no POST body), can't send prompt in body | Would require API redesign |
| **WebSocket upgrade** | Bidirectional, no proxy issues | Overengineered for one-shot commands, complex server code | High |

## FP Analysis
Not applicable (this is a bug fix, not a detection system).

## FN Analysis
Not applicable.

## Implementation Hints

### Files to modify

1. **`server/src/http/routes.ts`** (line ~212): Add `res.flushHeaders()` after setting SSE headers
2. **`dashboard/src/components/viewer/CommandDispatch.tsx`**: Replace XHR implementation with `fetch` + `ReadableStream.getReader()`
3. **`dashboard/src/components/viewer/CommandDispatch.test.ts`**: Update tests if parsing logic changes

### Test strategy

1. Manual test: Send prompt, verify output appears incrementally
2. Manual test: Send prompt, click Stop, verify cancellation works
3. Manual test: Send prompt that produces multi-line output, verify all lines render
4. Manual test: Send prompt that fails (e.g., invalid cwd), verify error displays
5. Verify through both direct server and Vite proxy

### SSE parsing improvement

The current code splits on `\n` (single newline) which incorrectly treats the blank line between SSE events as a separate line to parse. The correct approach is to split on `\n\n` (double newline = SSE event boundary) and keep a buffer for partial events that span chunk boundaries.

## Risk Analysis

### What could go wrong

1. **`fetch` streaming might not work through Vite proxy** -- Low risk. Verified that the proxy delivers chunks correctly via Node.js HTTP client. The proxy headers are already configured correctly.
2. **AbortController might not terminate the spawned process** -- When fetch is aborted, the server connection closes, but the child `claude` process might continue running. The server should handle `req.on('close')` to kill the child. **This is a pre-existing bug in the current code too.**
3. **TextDecoder edge case** -- Multi-byte UTF-8 characters split across chunks could cause issues. Using `{ stream: true }` in `TextDecoder.decode()` handles this correctly.

### Pre-existing bug: orphaned child processes

The server route does not listen for `req.on('close')` to kill the spawned `claude` process if the client disconnects. This means:
- Current XHR: clicking Stop aborts the XHR but the `claude` process keeps running
- Proposed fetch: same issue

This should be fixed as part of the implementation:

```typescript
req.on("close", () => {
  if (!child.killed) child.kill();
});
```

## References

- [Vite SSE proxy discussion](https://github.com/vitejs/vite/discussions/10851) -- Vite proxy SSE configuration
- [node-http-proxy SSE issue](https://github.com/http-party/node-http-proxy/issues/921) -- Buffering and timeout issues
- [51Degrees XHR streaming](https://51degrees.com/blog/how-to-use-xmlhttprequest-and-xdomainrequest-to-stream-messages) -- Chrome 2KB threshold documentation
- [MDN ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams) -- fetch + ReadableStream API
- [Streaming HTTP with fetch](https://stack.convex.dev/streaming-http-using-fetch) -- Modern streaming patterns
- [XHR Standard](https://xhr.spec.whatwg.org/) -- XHR event ordering specification
- [MDN XHR progress event](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/progress_event) -- progress event specification
