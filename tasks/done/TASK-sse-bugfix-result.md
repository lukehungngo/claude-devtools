# Bug Fix Result: SSE Streaming

## Bugs Fixed

### Bug 1: Vite proxy buffers SSE responses
- **File:** dashboard/vite.config.ts
- **Test:** No test runner configured -- verified via manual typecheck
- **Fix:** Added dedicated `/api/command` proxy entry before `/api` with `proxyRes` handler that sets `cache-control: no-cache` and `x-accel-buffering: no` headers to disable buffering

### Bug 2: fetch + ReadableStream unreliable through proxies
- **File:** dashboard/src/components/viewer/CommandDispatch.tsx
- **Test:** No test runner configured -- verified via manual typecheck
- **Fix:** Replaced `fetch` + `response.body.getReader()` approach with `XMLHttpRequest` + `onprogress` for reliable incremental SSE reading through proxies. Changed `abortRef` (AbortController) to `xhrRef` (XMLHttpRequest) and updated stop handler to call `xhr.abort()`

## Build Status
- Lint: No linter configured
- Typecheck: PASS (server + dashboard)
- Tests: No test runner configured

## Files Modified
- dashboard/vite.config.ts
- dashboard/src/components/viewer/CommandDispatch.tsx
