# P1-P3 Fetch Guards Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `response.ok` guards and fix stale-closure deps across 6 remaining files that missed the first round of fixes, covering bugs from P1 (data corruption) to P3 (silent failures).

**Architecture:** Same proven pattern from commit `6c56266`: add `if (!r.ok) throw new Error(\`HTTP \${r.status}\`)` before every `.json()` call on a fetch response. Each task follows strict TDD: failing test → minimal fix → green → commit. Every affected file already has a test file or one will be created.

**Tech Stack:** React, Vitest, `@testing-library/react`, TypeScript strict

---

## File Map

| File | Lines | Bug | Severity |
|------|-------|-----|----------|
| `dashboard/src/components/conversation/PromptInput.tsx` | 116–131 | No `r.ok` + missing AbortController on file autocomplete | P1+P2 |
| `dashboard/src/components/panels/MemoryEditor.tsx` | 43, 69 | No `r.ok` on load and save | P1 |
| `dashboard/src/hooks/useAgentLogs.ts` | 17, 40 | No `r.ok` in `fetchLogs` + stale `fetchLogs` dep | P1+P2 |
| `dashboard/src/hooks/useUsage.ts` | 9 | No `r.ok` | P1 |
| `dashboard/src/components/conversation/ConversationView.tsx` | 632, 670 | No `res.ok` on `handleClear` and `handleRewind` | P3 |
| `dashboard/src/lib/slashCommandHandler.ts` | 59,124,155,194,224,258,385,420,448,461,517,535,555,572,599 | 15 `res.json()` calls without `res.ok` guard | P3 |

---

### TASK-001: PromptInput — response.ok guard + AbortController on file autocomplete

**Files:**
- Modify: `dashboard/src/components/conversation/PromptInput.tsx:116–131`
- Test: `dashboard/src/components/conversation/PromptInput.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside `describe("PromptInput")` in `dashboard/src/components/conversation/PromptInput.test.tsx`, after the existing tests:

```tsx
describe("file autocomplete fetch", () => {
  it("non-2xx response keeps fileResults empty (does not accept poisoned body)", async () => {
    // Return 403 with a body that has files — should be rejected
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ files: ["/etc/passwd", "/secret"] }),
    });

    const { container } = render(
      <PromptInput projectHash="ph1" sessionId="s1" />
    );
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@foo" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => { await Promise.resolve(); });

    // Dropdown must NOT appear with the poisoned files
    expect(container.querySelector('[data-testid="file-dropdown"]')).toBeNull();
  });

  it("aborts in-flight file fetch when atPrefix changes before debounce fires", async () => {
    let abortCalled = false;
    const controller = { signal: { aborted: false }, abort: () => { abortCalled = true; } };
    vi.spyOn(globalThis, "AbortController").mockReturnValue(controller as unknown as AbortController);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    });

    const { container } = render(
      <PromptInput projectHash="ph1" sessionId="s1" />
    );
    const textarea = container.querySelector("textarea")!;

    // Type @foo, then change to @bar before debounce fires
    fireEvent.change(textarea, { target: { value: "@foo" } });
    // Immediately change again — old effect cleanup should abort
    fireEvent.change(textarea, { target: { value: "@bar" } });

    // Cleanup from previous render should have called abort
    expect(abortCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- PromptInput
```

Expected: 2 new tests FAIL (first test: poisoned files appear in dropdown; second: abortCalled is false)

- [ ] **Step 3: Implement the fix**

In `dashboard/src/components/conversation/PromptInput.tsx`, replace lines 109–132:

```tsx
// Debounced file fetch when @ prefix changes
useEffect(() => {
  if (atPrefix === null || !projectHash || !sessionId) {
    setFileResults([]);
    return;
  }

  const controller = new AbortController();

  if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
  fileDebounceRef.current = setTimeout(() => {
    const encoded = encodeURIComponent(atPrefix);
    fetch(`/api/sessions/${projectHash}/${sessionId}/files?prefix=${encoded}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { files?: string[] }) => {
        setFileResults(data.files ?? []);
        setSelectedFileIndex(-1);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFileResults([]);
      });
  }, 200);

  return () => {
    if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
    controller.abort();
  };
}, [atPrefix, projectHash, sessionId]);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- PromptInput
```

Expected: all PromptInput tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/conversation/PromptInput.tsx \
        dashboard/src/components/conversation/PromptInput.test.tsx
git commit -m "fix: response.ok guard + AbortController on PromptInput file autocomplete"
```

---

### TASK-002: MemoryEditor — response.ok on load and save

**Files:**
- Modify: `dashboard/src/components/panels/MemoryEditor.tsx:43,69`
- Test: `dashboard/src/components/panels/__tests__/MemoryEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside `describe("MemoryEditor")` in `dashboard/src/components/panels/__tests__/MemoryEditor.test.tsx`:

```tsx
it("non-2xx load does not render poisoned content", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ content: "# injected content" }),
  } as unknown as Response);

  render(<MemoryEditor projectHash="ph1" sessionId="s1" />);
  await waitFor(() => {
    // Should not render the poisoned content — it must stay in error state
    expect(screen.queryByText("injected content")).toBeNull();
  });
});

it("non-2xx save does NOT show 'Saved' — shows error instead", async () => {
  // Load succeeds first
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: "# My Project" }),
    } as Response)
    // Save returns 500 with success: true (poisoned response)
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: true }),
    } as unknown as Response);

  render(<MemoryEditor projectHash="ph1" sessionId="s1" />);

  // Wait for content to load
  await waitFor(() => {
    expect(screen.getByText("My Project")).toBeTruthy();
  });

  // Switch to edit mode
  const editBtn = screen.getByRole("button", { name: /edit/i });
  fireEvent.click(editBtn);

  // Click Save
  const saveBtn = await screen.findByRole("button", { name: /save/i });
  fireEvent.click(saveBtn);

  await waitFor(() => {
    // Must show an error, NOT "Saved"
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByText(/error/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- MemoryEditor
```

Expected: 2 new tests FAIL

- [ ] **Step 3: Implement the fix**

In `dashboard/src/components/panels/MemoryEditor.tsx`:

**Load fix (around line 42-43):**
```ts
fetch(`/api/sessions/${projectHash}/${sessionId}/memory`)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data: { content: string | null }) => {
```

**Save fix (around line 64-69) — add one line:**
```ts
const res = await fetch(`/api/sessions/${projectHash}/${sessionId}/memory`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: editContent }),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- MemoryEditor
```

Expected: all MemoryEditor tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/panels/MemoryEditor.tsx \
        dashboard/src/components/panels/__tests__/MemoryEditor.test.tsx
git commit -m "fix: response.ok guards on MemoryEditor load and save"
```

---

### TASK-003: useAgentLogs — response.ok + fix stale fetchLogs dep

**Files:**
- Modify: `dashboard/src/hooks/useAgentLogs.ts:17,40`
- Test: `dashboard/src/hooks/useAgentLogs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `dashboard/src/hooks/useAgentLogs.test.ts`:

First, update the `beforeEach` mock to include `ok: true` (otherwise existing tests break when we add the guard):

```ts
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [{ type: "user", uuid: "1" }] }),
    })
  );
});
```

Then append two new tests inside `describe("useAgentLogs")`:

```ts
it("non-2xx response keeps logs empty (does not accept poisoned body)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ events: [{ type: "user", uuid: "injected" }] }),
    })
  );

  const { result } = renderHook(() => useAgentLogs("hash1", "sess1", "agent1"));

  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });

  expect(result.current.logs).toHaveLength(0);
});

it("refetches with correct agentId when agentId and liveEventCount both change", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ events: [] }),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { rerender } = renderHook(
    ({ agentId, count }: { agentId: string; count: number }) =>
      useAgentLogs("hash1", "sess1", agentId, count),
    { initialProps: { agentId: "agent-a", count: 0 } }
  );

  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  const firstCall = mockFetch.mock.calls[0][0];
  expect(firstCall).toContain("agent-a");

  // Change agentId AND increment liveEventCount in same render
  await act(async () => {
    rerender({ agentId: "agent-b", count: 1 });
    await new Promise((r) => setTimeout(r, 10));
  });

  // The refetch caused by liveEventCount change must use agent-b, not agent-a
  const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0];
  expect(lastCall).toContain("agent-b");
  expect(lastCall).not.toContain("agent-a");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- useAgentLogs
```

Expected: 2 new tests FAIL; `beforeEach` update may also expose previously-masked failures in existing tests (fix those too by ensuring `ok: true`)

- [ ] **Step 3: Implement the fixes**

In `dashboard/src/hooks/useAgentLogs.ts`:

**Fix 1 — add `r.ok` guard in `fetchLogs` (around line 16-17):**
```ts
fetch(`/api/sessions/${projectHash}/${sessionId}/events/${agentId}`)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data: { events?: AgentLogEntry[] }) => {
```

**Fix 2 — add `fetchLogs` to the live-event refetch effect deps (line 36-40):**
```ts
// Refetch when live events arrive (replaces 3s polling)
useEffect(() => {
  if (liveEventCount && liveEventCount > 0 && projectHash && sessionId) {
    fetchLogs();
  }
}, [liveEventCount, fetchLogs]);
```
(Remove the `// eslint-disable-line react-hooks/exhaustive-deps` comment)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- useAgentLogs
```

Expected: all useAgentLogs tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useAgentLogs.ts \
        dashboard/src/hooks/useAgentLogs.test.ts
git commit -m "fix: response.ok guard in useAgentLogs fetchLogs; remove stale eslint-disable dep suppression"
```

---

### TASK-004: useUsage — response.ok guard

**Files:**
- Modify: `dashboard/src/hooks/useUsage.ts:9`
- Test: `dashboard/src/hooks/useUsage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/hooks/useUsage.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUsage } from "./useUsage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUsage", () => {
  it("fetches usage on mount when API returns ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ usage: { tokensIn: 100, tokensOut: 50 } }),
      })
    );

    const { result } = renderHook(() => useUsage());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(result.current.usage).not.toBeNull();
    expect((result.current.usage as { tokensIn: number }).tokensIn).toBe(100);
  });

  it("non-2xx response leaves usage null (does not accept poisoned usage data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ usage: { tokensIn: 9999999 } }),
      })
    );

    const { result } = renderHook(() => useUsage());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(result.current.usage).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the second test fails**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- useUsage
```

Expected: "non-2xx response leaves usage null" FAILS (current code accepts poisoned data)

- [ ] **Step 3: Implement the fix**

In `dashboard/src/hooks/useUsage.ts`, replace lines 8-11:

```ts
const fetchUsage = () => {
  fetch("/api/usage")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => setUsage(data.usage || null))
    .catch(() => {});
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- useUsage
```

Expected: both useUsage tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useUsage.ts \
        dashboard/src/hooks/useUsage.test.ts
git commit -m "fix: response.ok guard in useUsage"
```

---

### TASK-005: ConversationView — response.ok on handleClear and handleRewind

**Files:**
- Modify: `dashboard/src/components/conversation/ConversationView.tsx:627-638,667-675`
- Test: `dashboard/src/components/conversation/ConversationView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `dashboard/src/components/conversation/ConversationView.test.tsx`:

```tsx
describe("ConversationView handleClear fetch guard", () => {
  it("non-2xx on /sessions/new does NOT call onSessionStarted with a bad id", async () => {
    const onSessionStarted = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ sessionId: "bad-id-from-error-body" }),
      })
    );

    const events: SessionEvent[] = [];
    const turns = groupEventsIntoTurns(events);
    render(
      <ConversationView
        events={events}
        turns={turns}
        metrics={null}
        sessionCwd="/foo"
        onSessionStarted={onSessionStarted}
      />
    );

    // Trigger handleClear via keyboard shortcut (Ctrl+L)
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    // onSessionStarted must NOT have been called with "bad-id-from-error-body"
    expect(onSessionStarted).not.toHaveBeenCalledWith("bad-id-from-error-body");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- ConversationView.test
```

Expected: new test FAILS (current code calls `onSessionStarted("bad-id-from-error-body")`)

- [ ] **Step 3: Implement the fixes**

In `dashboard/src/components/conversation/ConversationView.tsx`:

**handleClear fix (around line 627-638):**
```ts
const handleClear = useCallback(async () => {
  if (!sessionCwd) return;
  try {
    const res = await fetch("/api/sessions/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: sessionCwd }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.sessionId) {
      onSessionStarted?.(data.sessionId);
    }
  } catch {
    // Silently fail
  }
}, [sessionCwd, onSessionStarted]);
```

**handleRewind fix (around line 667-675):**
```ts
const handleRewind = useCallback(async (userMessageId: string, dryRun: boolean): Promise<void> => {
  const targetId = activeSessionId || sessionId;
  if (!targetId) return;
  const res = await fetch(`/api/sessions/${targetId}/rewind`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMessageId, dryRun }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}, [activeSessionId, sessionId]);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- ConversationView.test
```

Expected: all ConversationView tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/conversation/ConversationView.tsx \
        dashboard/src/components/conversation/ConversationView.test.tsx
git commit -m "fix: response.ok guards on ConversationView handleClear and handleRewind"
```

---

### TASK-006: slashCommandHandler — response.ok for all 15 fetch pairs

**Files:**
- Modify: `dashboard/src/lib/slashCommandHandler.ts`
  - Lines: 54+59, 123+124, 150+155, 189+194, 219+224, 253+258, 380+385, 415+420, 444+448, 460+461, 512+517, 531+535, 551+555, 571+572, 594+599
- Test: `dashboard/src/lib/commandFormatters.test.ts` (existing) or new `dashboard/src/lib/slashCommandHandler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/slashCommandHandler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSlashCommand } from "./slashCommandHandler";

// Minimal ctx used only for testing command routing
function makeCtx(overrides: Partial<Parameters<typeof handleSlashCommand>[1]> = {}) {
  return {
    activeSessionId: "sess-1",
    sessionCwd: "/foo",
    targetSessionId: "sess-1",
    showOutput: vi.fn(),
    onSessionStarted: vi.fn(),
    ...overrides,
  } as Parameters<typeof handleSlashCommand>[1];
}

describe("slashCommandHandler — response.ok guard (P3 pattern)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("/clear: non-2xx with sessionId body does NOT call onSessionStarted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ sessionId: "bad-id" }),
      })
    );

    const ctx = makeCtx();
    await handleSlashCommand("/clear", ctx);

    expect(ctx.onSessionStarted).not.toHaveBeenCalled();
  });

  it("/fast: non-2xx shows error output, does not silently succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: true }),
      })
    );

    const ctx = makeCtx();
    await handleSlashCommand("/fast on", ctx);

    // showOutput must be called with error message, not success
    expect(ctx.showOutput).toHaveBeenCalled();
    const output = (ctx.showOutput as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(output.toLowerCase()).toContain("error");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/soh/working/ai/claude-devtools/dashboard
pnpm test -- slashCommandHandler
```

Expected: both tests FAIL (`/clear` calls `onSessionStarted("bad-id")`, `/fast` shows success)

- [ ] **Step 3: Implement all 15 fixes**

In `dashboard/src/lib/slashCommandHandler.ts`, add `if (!res.ok) throw new Error(\`HTTP \${res.status}\`)` immediately after each `const res = await fetch(...)`. Every location has an existing `try { ... } catch { showOutput("...") }` block so the throw is caught correctly.

There are 15 locations. Add the guard line after each fetch:

**Line 54 (→59): `/clear`**
```ts
const res = await fetch("/api/sessions/new", { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 123 (→124): `/permissions-info`**
```ts
const res = await fetch(`/api/sessions/${targetId}/permissions-info`);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 150 (→155): `/fast`**
```ts
const res = await fetch(`/api/sessions/${targetId}/fast`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 189 (→194): `/effort`**
```ts
const res = await fetch(`/api/sessions/${targetId}/effort`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 219 (→224): `/permission-mode`**
```ts
const res = await fetch(`/api/sessions/${targetId}/permission-mode`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 253 (→258): `/rename`**
```ts
const res = await fetch(`/api/sessions/${targetId}/rename`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 380 (→385): `/init`**
```ts
const res = await fetch(`/api/sessions/${targetId}/init`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 415 (→420): `/model`**
```ts
const res = await fetch(`/api/sessions/${targetId}/model`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 444 (→448): `/resume continue`**
```ts
const res = await fetch(`/api/sessions/${targetId}/continue`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 460 (→461): `/resume list`**
```ts
const res = await fetch("/api/sessions");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 512 (→517): `/add-dir`**
```ts
const res = await fetch(`/api/sessions/${targetId}/add-dir`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 531 (→535): `/login`**
```ts
const res = await fetch("/api/auth/login", { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 551 (→555): `/logout`**
```ts
const res = await fetch("/api/auth/logout", { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 571 (→572): `/output-styles list`**
```ts
const res = await fetch("/api/output-styles");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Line 594 (→599): `/output-style set`**
```ts
const res = await fetch(`/api/sessions/${targetId}/output-style`, { ... });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- slashCommandHandler
```

Expected: both new tests PASS; run full suite to check no regressions:

```bash
pnpm test
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/slashCommandHandler.ts \
        dashboard/src/lib/slashCommandHandler.test.ts
git commit -m "fix: response.ok guards for all 15 fetch calls in slashCommandHandler"
```

---

## Self-Review

### 1. Spec coverage

All 6 bugs from the audit are addressed:
- PromptInput file autocomplete → TASK-001
- MemoryEditor load + save → TASK-002
- useAgentLogs r.ok + stale dep → TASK-003
- useUsage → TASK-004
- ConversationView handleClear/handleRewind → TASK-005
- slashCommandHandler 15 fetches → TASK-006

### 2. Placeholder scan

No TBDs, no "add appropriate error handling" phrases — every step has exact code.

### 3. Type consistency

All guard lines follow the same pattern established in commit `6c56266`:
`if (!r.ok) throw new Error(\`HTTP \${r.status}\`)`

No method name divergence across tasks.
