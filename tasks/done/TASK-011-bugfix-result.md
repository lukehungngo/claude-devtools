# TASK-011: Fix SSE streaming, auto-scroll, orphaned processes

## Summary

Fixed three bugs:

1. **SSE streaming not working in browser** -- Replaced `XMLHttpRequest` + `onprogress` (broken due to Chrome's ~2KB buffer threshold) with `fetch` + `response.body.getReader()` for real-time streaming. Server-side: added `res.flushHeaders()` and `X-Accel-Buffering: no` header to prevent proxy buffering.

2. **Orphaned child processes** -- Added `req.on("close")` handler in the `/command` route to kill the spawned `claude` child process when the client disconnects.

3. **Auto-scroll not working** -- Both `SessionViewer` and `AgentLogs` set `scrollTop = scrollHeight` inside `useEffect`, but React hasn't painted the new DOM yet at that point. Wrapped the scroll assignment in `requestAnimationFrame` so it executes after the browser paints.

## Files Modified

- `server/src/http/routes.ts` -- Added `X-Accel-Buffering` header, `flushHeaders()`, `req.on("close")` cleanup
- `dashboard/src/components/viewer/CommandDispatch.tsx` -- Replaced XHR with fetch+getReader, xhrRef to abortRef
- `dashboard/src/components/viewer/SessionViewer.tsx` -- requestAnimationFrame in auto-scroll useEffect
- `dashboard/src/components/AgentLogs.tsx` -- requestAnimationFrame in auto-scroll useEffect

## Test Count

0 (no test framework configured)

## Verification

- `cd server && npx tsc --noEmit` -- clean
- `cd dashboard && npx tsc --noEmit` -- clean
- `git diff` reviewed -- no debug prints, no TODOs, no commented-out code
