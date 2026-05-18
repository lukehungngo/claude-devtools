# Insights Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Insights tab in the dashboard top bar visibly larger and add a polite 3-day-absence pulse animation to bring users back to the Insights page.

**Architecture:** Pure client-side feature. A `useInsightsNudge` hook reads `localStorage["cdt:insights-last-click"]` and returns `nudgeActive`. `InsightsPage` writes a fresh timestamp on mount. `Titlebar` consumes the hook to conditionally render a Sparkles icon and a bounded CSS pulse animation that respects `prefers-reduced-motion`.

**Tech Stack:** React + TypeScript + Vitest + @testing-library/react + Tailwind utility classes + @tanstack/react-router (`useLocation`). Theme tokens from `dashboard/src/styles/globals.css` (`--acc`, `--acc-glow`).

---

### Task 1: Add CSS keyframes + utility classes

**Files:**
- Modify: `dashboard/src/styles/globals.css` (append to end of file)

CSS keyframes can't be unit-tested in isolation (jsdom doesn't run animations). We add the styles first so subsequent component tests can assert class names, and we manually visual-check in Task 7.

- [ ] **Step 1: Append keyframes + utility classes to `dashboard/src/styles/globals.css`**

Use the `dt-` prefix to match the project convention (e.g. `.dt-skeleton` at line 852). Avoid the existing `@keyframes pulse` name.

```css
/* === Insights nudge animation ============================================ */
@keyframes dt-insights-pulse {
  0%   { box-shadow: 0 0 0 0   var(--acc); }
  50%  { box-shadow: 0 0 12px 2px var(--acc); }
  100% { box-shadow: 0 0 0 0   var(--acc); }
}

.dt-insights-pulse {
  animation: dt-insights-pulse 1.4s ease-in-out 5;
  animation-fill-mode: forwards;
}

.dt-insights-pulse-resting {
  box-shadow: var(--acc-glow);
  transition: box-shadow .2s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .dt-insights-pulse {
    animation: none;
    box-shadow: var(--acc-glow);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/styles/globals.css
git commit -m "feat(insights-nudge): add pulse keyframes + utility classes"
```

---

### Task 2: Build `useInsightsNudge` hook with full unit tests (TDD)

**Files:**
- Create: `dashboard/src/hooks/useInsightsNudge.ts`
- Create: `dashboard/src/hooks/useInsightsNudge.test.ts`

The hook reads `localStorage["cdt:insights-last-click"]` and returns `{ nudgeActive }`. Also exports a `safeWriteInsightsLastClick()` helper used by `InsightsPage` in Task 3.

- [ ] **Step 1: Write the failing test file**

Create `dashboard/src/hooks/useInsightsNudge.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInsightsNudge, safeWriteInsightsLastClick } from "./useInsightsNudge";

const KEY = "cdt:insights-last-click";

// Stable mock for @tanstack/react-router useLocation
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: globalMockPathname }),
}));

let globalMockPathname = "/";

describe("useInsightsNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    globalMockPathname = "/";
  });

  it("returns nudgeActive=true when localStorage key is absent", () => {
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(true);
  });

  it("returns nudgeActive=true when timestamp is 4 days old", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, fourDaysAgo);
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(true);
  });

  it("returns nudgeActive=false when timestamp is 2 days old", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, twoDaysAgo);
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(false);
  });

  it("returns nudgeActive=false on /insights regardless of timestamp", () => {
    globalMockPathname = "/insights";
    // No localStorage entry → would normally be true, but we're on the page
    const { result } = renderHook(() => useInsightsNudge());
    expect(result.current.nudgeActive).toBe(false);
  });

  it("returns nudgeActive=true when localStorage.getItem throws", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      const { result } = renderHook(() => useInsightsNudge());
      expect(result.current.nudgeActive).toBe(true);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});

describe("safeWriteInsightsLastClick", () => {
  beforeEach(() => localStorage.clear());

  it("writes an ISO timestamp to localStorage", () => {
    safeWriteInsightsLastClick();
    const raw = localStorage.getItem(KEY);
    expect(raw).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("does not throw when setItem throws", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("quota"); };
    try {
      expect(() => safeWriteInsightsLastClick()).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && pnpm vitest run useInsightsNudge.test 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './useInsightsNudge'" (or similar).

- [ ] **Step 3: Implement the hook + helper**

Create `dashboard/src/hooks/useInsightsNudge.ts`:

```ts
import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";

const STORAGE_KEY = "cdt:insights-last-click";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface InsightsNudgeState {
  nudgeActive: boolean;
}

function readLastClickMs(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function safeWriteInsightsLastClick(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable — silent no-op
  }
}

export function useInsightsNudge(): InsightsNudgeState {
  const { pathname } = useLocation();
  const isOnInsightsPage = pathname === "/insights";

  const lastClickMs = useMemo(
    () => (isOnInsightsPage ? null : readLastClickMs()),
    [isOnInsightsPage, pathname],
  );

  const nudgeActive =
    !isOnInsightsPage &&
    (lastClickMs === null || Date.now() - lastClickMs >= THREE_DAYS_MS);

  return { nudgeActive };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && pnpm vitest run useInsightsNudge.test 2>&1 | tail -15
```

Expected: 7 passed (5 hook tests + 2 helper tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useInsightsNudge.ts dashboard/src/hooks/useInsightsNudge.test.ts
git commit -m "feat(insights-nudge): add useInsightsNudge hook + safeWriteInsightsLastClick helper"
```

---

### Task 3: Wire `safeWriteInsightsLastClick` into `InsightsPage` mount

**Files:**
- Modify: `dashboard/src/routes/InsightsPage.tsx` (add useEffect after existing hooks)
- Create: `dashboard/src/routes/InsightsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/routes/InsightsPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { InsightsPage } from "./InsightsPage";

// Mock router so the page renders without a full router tree
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/insights" }),
  useNavigate: () => vi.fn(),
}));

// Mock heavy data hooks the InsightsPage pulls in — return empty shapes
vi.mock("../hooks/useInsightsAggregate", () => ({
  useInsightsAggregate: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("../hooks/useInsightsActivity.js", () => ({
  useInsightsActivity: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../hooks/useInsightsModelMix", () => ({
  useInsightsModelMix: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../hooks/useInsightsTopConsumers", () => ({
  useInsightsTopConsumers: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../hooks/useInsightsCommandsAgentsSkills", () => ({
  useInsightsCommandsAgentsSkills: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../hooks/useEfficiencyDiagnostics", () => ({
  useEfficiencyDiagnostics: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../contexts/LayoutContext", () => ({
  useLayoutContext: () => ({}),
}));

const KEY = "cdt:insights-last-click";

describe("InsightsPage — nudge timestamp", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("writes an ISO timestamp to localStorage on mount", () => {
    render(<InsightsPage />);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(raw!).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("does not throw if localStorage.setItem throws on mount", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try {
      expect(() => render(<InsightsPage />)).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && pnpm vitest run InsightsPage.test 2>&1 | tail -15
```

Expected: FAIL — first test expects a localStorage value that isn't being written yet.

- [ ] **Step 3: Add `useEffect` to `InsightsPage`**

In `dashboard/src/routes/InsightsPage.tsx`:

a) Add import at top (after existing hook imports):

```ts
import { safeWriteInsightsLastClick } from "../hooks/useInsightsNudge";
```

b) Inside the `InsightsPage` component body, after the existing `useState`/`useMemo` block and before the JSX return, add:

```ts
// Record this visit so the Titlebar nudge resets. Runs once on mount.
useEffect(() => {
  safeWriteInsightsLastClick();
}, []);
```

If the file already has many `useEffect`s, place this one at the top of the effect block to make its purpose visible.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && pnpm vitest run InsightsPage.test 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/routes/InsightsPage.tsx dashboard/src/routes/InsightsPage.test.tsx
git commit -m "feat(insights-nudge): write last-click timestamp on InsightsPage mount"
```

---

### Task 4: Resize Session/Insights tabs in Titlebar

**Files:**
- Modify: `dashboard/src/components/Titlebar.tsx:70-98`
- Create: `dashboard/src/components/Titlebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/Titlebar.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Titlebar } from "./Titlebar";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/" } }),
  useLocation: () => ({ pathname: "/" }),
}));

vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

afterEach(() => cleanup());

describe("Titlebar — Session/Insights tabs sizing", () => {
  it("renders Session and Insights buttons with text-base + py-2 + px-4 sizing", () => {
    render(<Titlebar />);
    const session = screen.getByTestId("nav-session");
    const insights = screen.getByTestId("nav-insights");

    for (const btn of [session, insights]) {
      expect(btn.className).toContain("text-base");
      expect(btn.className).toContain("py-2");
      expect(btn.className).toContain("px-4");
      expect(btn.className).not.toContain("text-xs");
      expect(btn.className).not.toContain("py-0.5");
    }
  });

  it("uses raised-contrast inactive text color (text-dt-text1, not text-dt-text2)", () => {
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights"); // inactive when pathname='/'
    expect(insights.className).toContain("text-dt-text1");
    expect(insights.className).not.toContain("text-dt-text2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -20
```

Expected: FAIL — current classes use `text-xs py-0.5 px-2.5` and `text-dt-text2`.

- [ ] **Step 3: Update Titlebar sizing**

In `dashboard/src/components/Titlebar.tsx`, replace the existing tab block (lines 70-98) with:

```tsx
{/* Nav pill — Session · Insights */}
<div
  data-testid="nav-pill"
  className="flex items-center gap-1 bg-dt-bg2 border border-dt-border rounded-full p-1 shrink-0"
>
  <button
    type="button"
    data-testid="nav-session"
    aria-current={!isInsights ? ("page" as const) : undefined}
    onClick={() => navigate({ to: "/" })}
    className={[
      "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
      !isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
    ].join(" ")}
  >
    Session
  </button>
  <button
    type="button"
    data-testid="nav-insights"
    aria-current={isInsights ? ("page" as const) : undefined}
    onClick={() => navigate({ to: "/insights" })}
    className={[
      "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
      isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
    ].join(" ")}
  >
    Insights
  </button>
</div>
```

Container padding goes `p-0.5` → `p-1`, inner gap `gap-0.5` → `gap-1`, button padding `px-2.5 py-0.5` → `px-4 py-2`, font `text-xs` → `text-base`, inactive text `text-dt-text2` → `text-dt-text1`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/Titlebar.tsx dashboard/src/components/Titlebar.test.tsx
git commit -m "feat(insights-nudge): enlarge Session/Insights tabs to match brand text"
```

---

### Task 5: Add conditional Sparkles icon + pulse class to Insights tab

**Files:**
- Modify: `dashboard/src/components/Titlebar.tsx` (import + tab JSX)
- Modify: `dashboard/src/components/Titlebar.test.tsx` (add nudge tests)

- [ ] **Step 1: Add failing tests for nudge UI**

Append to `dashboard/src/components/Titlebar.test.tsx`:

```tsx
// Mock the nudge hook so we can flip nudgeActive in tests
vi.mock("../hooks/useInsightsNudge", () => ({
  useInsightsNudge: vi.fn(),
  safeWriteInsightsLastClick: vi.fn(),
}));

import { useInsightsNudge } from "../hooks/useInsightsNudge";

describe("Titlebar — Insights nudge UI", () => {
  it("renders Sparkles icon inside Insights button when nudgeActive=true", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: true });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");
    // lucide-react renders an <svg> for icons
    expect(insights.querySelector("svg")).not.toBeNull();
    expect(insights.className).toContain("dt-insights-pulse");
  });

  it("does NOT render Sparkles icon or pulse class when nudgeActive=false", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: false });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");
    expect(insights.querySelector("svg")).toBeNull();
    expect(insights.className).not.toContain("dt-insights-pulse");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -15
```

Expected: 2 new failures (Sparkles svg not present, pulse class not present).

- [ ] **Step 3: Wire the hook + conditional icon into Titlebar**

In `dashboard/src/components/Titlebar.tsx`:

a) Update the imports at the top:

```ts
import { Sun, Moon, Sparkles } from "lucide-react";
import { useInsightsNudge } from "../hooks/useInsightsNudge";
```

b) Inside the `Titlebar` component body (where the existing hooks like `useTheme` live), add:

```ts
const { nudgeActive } = useInsightsNudge();
```

c) Replace the Insights `<button>` JSX with the conditional-Sparkles + pulse-class version:

```tsx
<button
  type="button"
  data-testid="nav-insights"
  aria-current={isInsights ? ("page" as const) : undefined}
  onClick={() => navigate({ to: "/insights" })}
  className={[
    "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
    "inline-flex items-center",
    isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
    nudgeActive ? "dt-insights-pulse" : "",
  ].filter(Boolean).join(" ")}
>
  {nudgeActive && (
    <Sparkles size={14} className="mr-1.5 inline-block" aria-hidden="true" />
  )}
  Insights
</button>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -10
```

Expected: 4 passed (2 sizing tests from Task 4 + 2 new nudge tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/Titlebar.tsx dashboard/src/components/Titlebar.test.tsx
git commit -m "feat(insights-nudge): conditional Sparkles + pulse class on Insights tab"
```

---

### Task 6: animationend → swap to resting class

**Files:**
- Modify: `dashboard/src/components/Titlebar.tsx` (add state + ref + handler)
- Modify: `dashboard/src/components/Titlebar.test.tsx` (animationend test)

- [ ] **Step 1: Add failing test for animationend transition**

Append to `dashboard/src/components/Titlebar.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

describe("Titlebar — Insights nudge animationend transition", () => {
  it("swaps to dt-insights-pulse-resting after animationend fires", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: true });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");

    expect(insights.className).toContain("dt-insights-pulse");
    expect(insights.className).not.toContain("dt-insights-pulse-resting");

    fireEvent.animationEnd(insights, { animationName: "dt-insights-pulse" });

    expect(insights.className).not.toContain("dt-insights-pulse ");  // trailing space — match exact class, not the resting one
    expect(insights.className).toContain("dt-insights-pulse-resting");
  });

  it("ignores animationend events for unrelated animations", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: true });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");

    fireEvent.animationEnd(insights, { animationName: "some-other-animation" });

    expect(insights.className).toContain("dt-insights-pulse");
    expect(insights.className).not.toContain("dt-insights-pulse-resting");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -15
```

Expected: 2 new failures (no `dt-insights-pulse-resting` class swap yet).

- [ ] **Step 3: Add state + animationend handler**

In `dashboard/src/components/Titlebar.tsx`, inside the `Titlebar` component:

a) Add a local state, after the existing `useInsightsNudge` call:

```ts
const [pulseSettled, setPulseSettled] = useState(false);

useEffect(() => {
  // Reset whenever the nudge re-activates so we re-run the pulse if the user
  // ever goes 3 days without visiting again.
  if (nudgeActive) setPulseSettled(false);
}, [nudgeActive]);

const handleInsightsAnimationEnd = (e: React.AnimationEvent<HTMLButtonElement>) => {
  if (e.animationName === "dt-insights-pulse") {
    setPulseSettled(true);
  }
};
```

b) Update the Insights `<button>` to attach the handler and pick the right class based on `pulseSettled`:

```tsx
<button
  type="button"
  data-testid="nav-insights"
  aria-current={isInsights ? ("page" as const) : undefined}
  onClick={() => navigate({ to: "/insights" })}
  onAnimationEnd={handleInsightsAnimationEnd}
  className={[
    "px-4 py-2 rounded-full font-mono text-base font-semibold transition-all border-none cursor-pointer",
    "inline-flex items-center",
    isInsights ? "bg-dt-bg1 text-dt-accent" : "bg-transparent text-dt-text1",
    nudgeActive && !pulseSettled ? "dt-insights-pulse" : "",
    nudgeActive && pulseSettled ? "dt-insights-pulse-resting" : "",
  ].filter(Boolean).join(" ")}
>
  {nudgeActive && (
    <Sparkles size={14} className="mr-1.5 inline-block" aria-hidden="true" />
  )}
  Insights
</button>
```

Also import `React` for the `AnimationEvent` type if not already present (it's available via the JSX runtime, but the explicit type annotation needs `React.AnimationEvent`):

```ts
import { useState, useEffect, type AnimationEvent } from "react";
```

Then change the handler signature to `(e: AnimationEvent<HTMLButtonElement>)`. (Pick whichever import style your codebase already uses — match the existing pattern in the file.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && pnpm vitest run Titlebar.test 2>&1 | tail -10
```

Expected: 6 passed (sizing 2 + nudge UI 2 + animationend 2).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/Titlebar.tsx dashboard/src/components/Titlebar.test.tsx
git commit -m "feat(insights-nudge): settle to resting glow after pulse animation ends"
```

---

### Task 7: Final verification — full test suite + type check + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full dashboard test suite**

```bash
cd dashboard && pnpm test 2>&1 | tail -10
```

Expected: 0 failures. Should show all new tests passing plus all pre-existing tests still green.

- [ ] **Step 2: Run TypeScript type check**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no output (clean).

- [ ] **Step 3: Manual visual check in dev mode**

```bash
cd dashboard && pnpm dev
```

Open the dashboard in Chrome at the Vite URL it prints. Verify:

- Session / Insights tabs are visibly bigger (height ~40px, text-base font).
- Clear localStorage (`localStorage.clear()` in DevTools console) and reload the home (`/`) page.
- The Insights tab should show a Sparkles icon + pulse animation for ~7 seconds, then settle to a static glow.
- Hover over the tab → animation should not re-trigger.
- Click Insights → page loads, navigate back to `/` → Sparkles is gone, no glow.
- Set localStorage to a 4-day-old timestamp: `localStorage.setItem("cdt:insights-last-click", new Date(Date.now() - 4*86400_000).toISOString())`, reload `/` → nudge plays again.
- Set localStorage to a 2-day-old timestamp: reload `/` → no nudge.
- macOS System Settings → Accessibility → Display → Reduce motion: ON → reload `/` → no pulse, just a static glow + Sparkles icon. (Or set the OS preference via DevTools emulation: `prefers-reduced-motion: reduce`.)

- [ ] **Step 4: Final commit (only if any manual-check tweaks were needed)**

If everything looks good and no tweaks: no commit needed. If you adjusted shadow blur, animation duration, or icon size during the visual check:

```bash
git add dashboard/src/styles/globals.css dashboard/src/components/Titlebar.tsx
git commit -m "fix(insights-nudge): tweak <thing> based on visual review"
```
