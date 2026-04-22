# SDK Account Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keychain-scraping for plan name with `query.accountInfo()` from the `@anthropic-ai/claude-agent-sdk`, so the dashboard's plan display (e.g. "Pro", "Max") is sourced from the SDK rather than regex-matching against raw credential strings.

**Architecture:** When a session starts in `SessionManager`, fire-and-forget `responseStream.accountInfo()` and write the result to a module-level in-memory store (`account-info-store.ts`). The existing `/api/usage` route calls `getAnthropicUsage()` which reads from that store first, falling back to the current keychain path only when no SDK session has ever provided account info. The `getPlanName()` display-name mapper stays unchanged — `AccountInfo.subscriptionType` from the SDK is the same raw string as the keychain's `subscriptionType`.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (already installed), TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/api/account-info-store.ts` | **Create** | Module-level cache for SDK-vended `AccountInfo`; exposes `setAccountInfo()` and `getAccountInfo()` |
| `server/src/session/session-manager.ts` | **Modify** | After `responseStream` is created, fire `responseStream.accountInfo()` and call `setAccountInfo()` |
| `server/src/api/usage-client.ts` | **Modify** | In `getAnthropicUsage()`, read `subscriptionType` from store before falling back to keychain |
| `server/src/api/account-info-store.test.ts` | **Create** | Unit tests for the store |
| `server/src/api/usage-client.test.ts` | **Modify** | Add tests for SDK-primary path and keychain-fallback path |

---

## Tasks

### Task 1: Create `account-info-store.ts`

**Files:**
- Create: `server/src/api/account-info-store.ts`
- Create: `server/src/api/account-info-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/api/account-info-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { setAccountInfo, getAccountInfo, clearAccountInfo } from "./account-info-store.js";

describe("account-info-store", () => {
  beforeEach(() => { clearAccountInfo(); });

  it("returns null before any info is set", () => {
    expect(getAccountInfo()).toBeNull();
  });

  it("stores and returns subscriptionType", () => {
    setAccountInfo({ subscriptionType: "claude_pro_subscription" });
    expect(getAccountInfo()).toEqual({ subscriptionType: "claude_pro_subscription" });
  });

  it("overwrites previous value on second set", () => {
    setAccountInfo({ subscriptionType: "claude_pro_subscription" });
    setAccountInfo({ subscriptionType: "claude_max_subscription", email: "a@b.com" });
    expect(getAccountInfo()?.subscriptionType).toBe("claude_max_subscription");
    expect(getAccountInfo()?.email).toBe("a@b.com");
  });

  it("ignores set when subscriptionType is missing", () => {
    setAccountInfo({});
    expect(getAccountInfo()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && node_modules/.bin/vitest run src/api/account-info-store.test.ts --reporter verbose
```
Expected: `FAIL` — module not found.

- [ ] **Step 3: Implement the store**

```ts
// server/src/api/account-info-store.ts
import type { AccountInfo } from "@anthropic-ai/claude-agent-sdk";

let store: AccountInfo | null = null;

export function setAccountInfo(info: AccountInfo): void {
  if (!info.subscriptionType) return;
  store = info;
}

export function getAccountInfo(): AccountInfo | null {
  return store;
}

/** Only for tests — resets module state. */
export function clearAccountInfo(): void {
  store = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && node_modules/.bin/vitest run src/api/account-info-store.test.ts --reporter verbose
```
Expected: all 4 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add server/src/api/account-info-store.ts server/src/api/account-info-store.test.ts
git commit -m "feat: add account-info-store for SDK-vended AccountInfo"
```

---

### Task 2: Call `accountInfo()` in `SessionManager` on session start

**Files:**
- Modify: `server/src/session/session-manager.ts` (around line 196–205, after `session.activeQuery = responseStream`)

- [ ] **Step 1: Write the failing test**

In `server/src/session/session-manager.test.ts`, add inside an appropriate `describe` block:

```ts
import { getAccountInfo, clearAccountInfo } from "../api/account-info-store.js";

describe("SessionManager account info caching", () => {
  beforeEach(() => { clearAccountInfo(); });

  it("calls accountInfo() on the query and stores the result", async () => {
    // Arrange: mock query to resolve accountInfo
    const mockAccountInfo = vi.fn().mockResolvedValue({
      subscriptionType: "claude_pro_subscription",
      email: "user@example.com",
    });
    // The existing mock for `query` in this test file — add accountInfo to it:
    // mockQueryFn.mockReturnValue({ ...existingMock, accountInfo: mockAccountInfo });
    // (wire to whichever fixture already mocks the SDK query call)

    // Act: start a session and send one message
    // (use the existing startSession + sendMessage helper in this test file)

    // Assert
    expect(mockAccountInfo).toHaveBeenCalledOnce();
    expect(getAccountInfo()?.subscriptionType).toBe("claude_pro_subscription");
  });

  it("does not throw when accountInfo() rejects", async () => {
    const mockAccountInfo = vi.fn().mockRejectedValue(new Error("network error"));
    // wire as above
    // starting/sending a session should not throw
    await expect(/* startSession + send */).resolves.not.toThrow();
    expect(getAccountInfo()).toBeNull();
  });
});
```

> **Note:** Look at the existing `session-manager.test.ts` fixtures to see how `query` from `@anthropic-ai/claude-agent-sdk` is mocked (it uses `vi.mock`). Add `accountInfo: mockAccountInfo` to the existing mock return value.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && node_modules/.bin/vitest run src/session/session-manager.test.ts --reporter verbose -t "account info"
```
Expected: `FAIL` — `mockAccountInfo` not called.

- [ ] **Step 3: Add the `accountInfo()` call in `session-manager.ts`**

After the existing `supportedCommands()` fire-and-forget block (line ~199–205 in `session-manager.ts`), add:

```ts
// Proactively cache SDK-provided account info (plan name, email, etc.)
if (responseStream.accountInfo) {
  responseStream.accountInfo()
    .then((info) => {
      import("../api/account-info-store.js")
        .then(({ setAccountInfo }) => setAccountInfo(info))
        .catch(() => { /* noop */ });
    })
    .catch(() => { /* noop — not critical */ });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && node_modules/.bin/vitest run src/session/session-manager.test.ts --reporter verbose -t "account info"
```
Expected: both tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add server/src/session/session-manager.ts
git commit -m "feat: call query.accountInfo() on session start and cache result"
```

---

### Task 3: Use SDK-cached account info in `usage-client.ts`

**Files:**
- Modify: `server/src/api/usage-client.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/api/usage-client.test.ts` (or add to existing file if it exists):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock https.request so no real network calls happen
vi.mock("node:https", () => ({
  request: vi.fn().mockImplementation((_opts, cb) => {
    const res = { statusCode: 200, on: vi.fn() };
    // simulate empty usage response
    res.on.mockImplementation((event: string, handler: (data?: string) => void) => {
      if (event === "data") handler('{"five_hour":{"utilization":42,"resets_at":"2026-01-01T00:00:00Z"},"seven_day":{"utilization":10,"resets_at":"2026-01-07T00:00:00Z"}}');
      if (event === "end") handler();
    });
    cb(res);
    return { on: vi.fn(), end: vi.fn() };
  }),
}));

// Mock child_process so keychain isn't hit
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: "" }),
}));

// Mock fs so credentials file isn't hit
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue("{}"),
  readdirSync: vi.fn().mockReturnValue([]),
}));

import { setAccountInfo, clearAccountInfo } from "./account-info-store.js";
import { getAnthropicUsage, resetUsageCache } from "./usage-client.js";

describe("getAnthropicUsage — SDK-primary path", () => {
  beforeEach(() => {
    clearAccountInfo();
    resetUsageCache();
  });

  it("uses subscriptionType from SDK account store when available", async () => {
    setAccountInfo({ subscriptionType: "claude_pro_subscription" });
    const result = await getAnthropicUsage();
    expect(result?.planName).toBe("Pro");
  });

  it("uses subscriptionType from SDK even when keychain would fail", async () => {
    setAccountInfo({ subscriptionType: "claude_max_subscription" });
    const result = await getAnthropicUsage();
    expect(result?.planName).toBe("Max");
  });

  it("returns null when both SDK store and keychain are empty", async () => {
    const result = await getAnthropicUsage();
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && node_modules/.bin/vitest run src/api/usage-client.test.ts --reporter verbose
```
Expected: FAIL — `resetUsageCache` not exported, SDK store not checked.

- [ ] **Step 3: Update `usage-client.ts`**

**3a. Export `resetUsageCache` for testing:**

At the bottom of the cache block, add:
```ts
/** Only for tests — resets the in-memory usage cache. */
export function resetUsageCache(): void {
  cachedUsage = null;
}
```

**3b. Update `getAnthropicUsage()` to check the SDK store first:**

```ts
export async function getAnthropicUsage(): Promise<UsageInfo | null> {
  // Check cache
  if (cachedUsage && Date.now() - cachedUsage.timestamp < CACHE_TTL_MS) {
    return cachedUsage.data;
  }

  // Primary: use subscriptionType from SDK-vended AccountInfo if available
  let subscriptionType: string | null = null;
  try {
    const { getAccountInfo } = await import("./account-info-store.js");
    subscriptionType = getAccountInfo()?.subscriptionType ?? null;
  } catch { /* noop */ }

  // Fallback: read from keychain / credentials file
  if (!subscriptionType) {
    const credentials = readKeychainToken();
    if (!credentials) return null;
    subscriptionType = credentials.subscriptionType;
    // Need the access token for the usage API — get it from keychain since SDK store
    // doesn't expose the raw token.
    const planName = getPlanName(subscriptionType);
    if (!planName) return null;

    const accessToken = credentials.accessToken;
    return fetchAndCacheUsage(accessToken, planName);
  }

  // SDK path — we have subscriptionType but not the raw access token.
  // Read the token only for the usage API call (keychain read is still needed here).
  const planName = getPlanName(subscriptionType);
  if (!planName) return null;

  const credentials = readKeychainToken();
  if (!credentials) {
    // No token for usage API — return plan name only
    return {
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
      planName,
    };
  }

  return fetchAndCacheUsage(credentials.accessToken, planName);
}
```

**3c. Extract `fetchAndCacheUsage` helper** (to avoid duplication in the two paths above):

```ts
async function fetchAndCacheUsage(accessToken: string, planName: string): Promise<UsageInfo> {
  const apiData = await fetchUsageFromApi(accessToken);

  if (!apiData) {
    if (lastGoodUsage) {
      const fallback: UsageInfo = { ...lastGoodUsage, planName };
      cachedUsage = { data: fallback, timestamp: Date.now() };
      return fallback;
    }
    return { fiveHour: { utilization: null, resetsAt: null }, sevenDay: { utilization: null, resetsAt: null }, planName };
  }

  const result: UsageInfo = {
    fiveHour: {
      utilization: clampUtilization(apiData.five_hour?.utilization),
      resetsAt: apiData.five_hour?.resets_at || null,
    },
    sevenDay: {
      utilization: clampUtilization(apiData.seven_day?.utilization),
      resetsAt: apiData.seven_day?.resets_at || null,
    },
    planName,
  };

  lastGoodUsage = result;
  cachedUsage = { data: result, timestamp: Date.now() };
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && node_modules/.bin/vitest run src/api/usage-client.test.ts --reporter verbose
```
Expected: all tests `PASS`.

- [ ] **Step 5: Type-check**

```bash
cd server && node_modules/.bin/tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/api/usage-client.ts server/src/api/usage-client.test.ts
git commit -m "feat: prefer SDK accountInfo() over keychain for plan name in usage-client"
```

---

### Task 4: Full test pass

- [ ] **Step 1: Run all server tests**

```bash
cd server && node_modules/.bin/vitest run --reporter verbose 2>&1 | tail -20
```
Expected: same pass count as before + new tests passing. Zero new failures.

- [ ] **Step 2: Type-check both packages**

```bash
cd server && node_modules/.bin/tsc --noEmit && echo "server OK" && \
cd ../dashboard && node_modules/.bin/tsc --noEmit && echo "dashboard OK"
```
Expected: `server OK` and `dashboard OK`.

- [ ] **Step 3: Final commit**

```bash
git add -p
git commit -m "chore: verify SDK account info integration end-to-end"
```

---

## Dependency Graph

```
Task 1 (account-info-store) → Task 2 (session-manager calls it)
Task 1                       → Task 3 (usage-client reads it)
Task 2 + Task 3             → Task 4 (full integration test)
```

Tasks 2 and 3 can be worked in parallel once Task 1 is done.

---

## Risk Assessment

- **`accountInfo()` availability on Query:** The SDK's `Query` type exposes `accountInfo()` as an async method. We guard with `if (responseStream.accountInfo)` so the call is silently skipped if the SDK version doesn't expose it yet.
- **Race condition:** `accountInfo()` is fire-and-forget. If `/api/usage` is called before any session has started, the store is empty and we fall back to keychain. This is acceptable — the fallback exists for exactly this case.
- **Token still needed for usage API:** `AccountInfo` gives us `subscriptionType` but not the raw OAuth token. The keychain is still used to get the token for `https://api.anthropic.com/api/oauth/usage`. This is a partial migration — the plan name source changes but the usage-rate fetch still needs the token.
- **`getPlanName()` mapping stays:** The mapping `"claude_pro_subscription" → "Pro"` is still needed since `AccountInfo.subscriptionType` is the same raw string. A future cleanup could remove it if Anthropic adds a `planName` field to `AccountInfo`.
