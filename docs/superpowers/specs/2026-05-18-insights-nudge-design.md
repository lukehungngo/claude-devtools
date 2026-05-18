# Insights Nudge — Design

**Status:** Approved for implementation
**Date:** 2026-05-18
**Scope:** Dashboard `Titlebar` Session/Insights tabs + first-party reminder for the Insights page

## Problem

The top-bar Session/Insights segmented control is currently small (`text-xs py-0.5 px-2.5`, ~24px tall) and visually subordinate to the brand text "Claude DevTools". Users who installed the dashboard primarily for the Session view rarely visit Insights even though the longitudinal data there is the highest-value surface in the product. We need to (a) raise the visual weight of both tabs and (b) give Insights a polite, non-annoying nudge when the user has been away from it for 3+ days.

## Goals

1. **Visual hierarchy.** Session and Insights tabs match the brand line height (~40px) so they feel like primary navigation, not an afterthought.
2. **Re-engagement.** After 3 days without visiting `/insights`, the Insights tab self-announces with a bounded pulse animation and a Sparkles icon.
3. **Respect.** The animation stops on its own (no infinite loop), stops on hover, and respects `prefers-reduced-motion`. It must never block clicks or feel like a notification badge demanding action.

## Non-goals

- No analytics on click counts, no telemetry, no server-side tracking.
- No multi-stage nudge (no escalating animation, no toast on top).
- No tracking the first-time-user case differently from the stale-user case — both flow through the same "no timestamp present → treat as stale" path.

## Design

### Tab sizing — `Titlebar.tsx`

Current (`Titlebar.tsx:70-98`):

```tsx
<div className="flex items-center gap-0.5 bg-dt-bg2 border border-dt-border rounded-full p-0.5 shrink-0">
  <button className="px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold ...">Session</button>
  <button className="px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold ...">Insights</button>
</div>
```

New:

```tsx
<div className="flex items-center gap-1 bg-dt-bg2 border border-dt-border rounded-full p-1 shrink-0">
  <button className="px-4 py-2 rounded-full font-mono text-base font-semibold ...">Session</button>
  <button className="px-4 py-2 rounded-full font-mono text-base font-semibold ...">
    {nudgeActive && <Sparkles size={14} className="mr-1.5 inline-block align-[-2px]" />}
    Insights
  </button>
</div>
```

Changes:

| Property | Before | After |
|---|---|---|
| Container padding | `p-0.5` | `p-1` |
| Inner gap | `gap-0.5` | `gap-1` |
| Button x-padding | `px-2.5` | `px-4` |
| Button y-padding | `py-0.5` | `py-2` |
| Font size | `text-xs` (12px) | `text-base` (16px) |
| Inactive text color | `text-dt-text2` | `text-dt-text1` (raise contrast) |
| Insights icon | none | `Sparkles` (lucide-react), only when `nudgeActive` |

Active state styling (`bg-dt-bg1 text-dt-accent`) is unchanged.

### Nudge state machine

```
nudgeActive = !isOnInsightsPage
            && (daysSinceLastClick >= 3 || lastClickAt === null)
```

- `isOnInsightsPage` derived from `useLocation().pathname === "/insights"`.
- `daysSinceLastClick` computed from `localStorage["cdt:insights-last-click"]`.
- Missing key → `daysSinceLastClick = Infinity` → nudge plays for first-time users.

### Animation specification

When `nudgeActive === true`:

```css
@keyframes cdt-insights-pulse {
  0%   { box-shadow: 0 0 0   0   var(--acc, transparent); }
  50%  { box-shadow: 0 0 12px 2px var(--acc); }
  100% { box-shadow: 0 0 0   0   var(--acc, transparent); }
}

.cdt-insights-pulse {
  animation: cdt-insights-pulse 1.4s ease-in-out 5;     /* 5 iterations */
  animation-fill-mode: forwards;
}

.cdt-insights-pulse-resting {
  box-shadow: 0 0 6px 0 var(--acc-soft, var(--acc));    /* residual static glow */
}

@media (prefers-reduced-motion: reduce) {
  .cdt-insights-pulse {
    animation: none;                                     /* skip pulse */
    box-shadow: 0 0 6px 0 var(--acc-soft, var(--acc));   /* show residual glow only */
  }
}
```

Lifecycle:

1. Component mounts → if `nudgeActive`, button has class `cdt-insights-pulse`.
2. After 7 seconds (5 × 1.4s), an `animationend` listener swaps the class to `cdt-insights-pulse-resting` so a static glow remains.
3. `onMouseEnter` removes both classes immediately and applies `cdt-insights-pulse-resting` only.
4. On click → user navigates to `/insights` → InsightsPage effect writes a fresh timestamp → next render of Titlebar computes `nudgeActive = false` → both classes removed.

### localStorage contract

| Field | Value |
|---|---|
| Key | `cdt:insights-last-click` |
| Value | ISO 8601 timestamp string (e.g. `2026-05-18T19:34:32.000Z`) |
| Reader | `useInsightsNudge` hook, read on mount and whenever location changes |
| Writer | `useEffect(() => { safeWriteInsightsLastClick(); }, []);` inside `InsightsPage.tsx` (mounts once per route entry) |

A guarded helper handles environments where localStorage is unavailable (private mode quota, blocked storage):

```ts
// dashboard/src/hooks/useInsightsNudge.ts (co-located with the hook)
export function safeWriteInsightsLastClick(): void {
  try {
    localStorage.setItem("cdt:insights-last-click", new Date().toISOString());
  } catch {
    // localStorage unavailable — silent no-op
  }
}
```

### Hook shape

```ts
// dashboard/src/hooks/useInsightsNudge.ts
export interface InsightsNudgeState {
  nudgeActive: boolean;
}

export function useInsightsNudge(): InsightsNudgeState;
```

Implementation outline:

```ts
import { useLocation } from "@tanstack/react-router";

const STORAGE_KEY = "cdt:insights-last-click";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function useInsightsNudge(): InsightsNudgeState {
  const location = useLocation();
  const isOnInsightsPage = location.pathname === "/insights";

  // Re-read on every navigation. localStorage reads are <1µs.
  const lastClickAt = useMemo(() => {
    if (isOnInsightsPage) return null; // bypass — answer is false anyway
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Date(raw).getTime() : null;
    } catch {
      return null;
    }
  }, [isOnInsightsPage, location.pathname]);

  const nudgeActive =
    !isOnInsightsPage &&
    (lastClickAt === null || Date.now() - lastClickAt >= THREE_DAYS_MS);

  return { nudgeActive };
}
```

## Edge cases

| Case | Behavior |
|---|---|
| First-time user (no localStorage entry) | Nudge plays (treated as stale) |
| User clears localStorage | Same as first-time |
| User visits `/insights` then navigates back within the same session | Tab re-renders, nudge stays off (timestamp was written < 3 days ago) |
| Multiple Chrome tabs open | localStorage is shared; last write wins. Acceptable. |
| Page kept open for 4+ days without reload | Nudge does NOT spontaneously appear mid-session — `nudgeActive` is computed on render. Next route change (or page reload) will re-evaluate. **By design** — we don't want surprise animations during long-running sessions. |
| Clock skew (system time set backwards) | `Date.now() - lastClickAt` may be negative → falls below threshold → nudge stays off. Acceptable; no harm from a missed nudge. |
| `prefers-reduced-motion: reduce` | Skip pulse entirely, show static glow + Sparkles icon only |

## Test plan

### Unit — `useInsightsNudge.test.ts`

- `nudgeActive === true` when localStorage key absent
- `nudgeActive === true` when timestamp is 4 days old
- `nudgeActive === false` when timestamp is 2 days old
- `nudgeActive === false` when on `/insights` regardless of timestamp
- Returns `nudgeActive === true` when localStorage throws on read (private mode)

### Unit — `Titlebar.test.tsx`

- Renders Sparkles icon when `nudgeActive === true` (mock the hook)
- Does NOT render Sparkles icon when `nudgeActive === false`
- Adds `cdt-insights-pulse` class only when `nudgeActive === true`
- Removes `cdt-insights-pulse` class on `mouseenter` and applies `cdt-insights-pulse-resting` instead
- Larger size tokens applied (assert presence of `text-base`, `px-4`, `py-2` classes on both buttons)

### Unit — `InsightsPage.test.tsx`

- Writes `cdt:insights-last-click` with a fresh ISO timestamp on mount
- Does not throw if localStorage write fails (mocked)

### Integration

- Navigate Session → Insights → assert localStorage key exists and is within last second
- Navigate back to `/` immediately → assert Titlebar Sparkles is absent (timestamp is fresh)
- Manually set localStorage to a 4-day-old timestamp, reload, navigate to `/` → assert Sparkles renders + button has pulse class

## Files changed

| File | Change |
|---|---|
| `dashboard/src/components/Titlebar.tsx` | Bigger tab sizing, conditional Sparkles icon, pulse classes |
| `dashboard/src/components/Titlebar.test.tsx` (new) | Test bigger sizing + nudge UI |
| `dashboard/src/hooks/useInsightsNudge.ts` (new) | Hook providing `nudgeActive` |
| `dashboard/src/hooks/useInsightsNudge.test.ts` (new) | Hook unit tests |
| `dashboard/src/routes/InsightsPage.tsx` | `useEffect` writing localStorage on mount |
| `dashboard/src/routes/InsightsPage.test.tsx` (existing or new) | Test localStorage write on mount |
| `dashboard/src/index.css` (or theme tokens file) | `@keyframes cdt-insights-pulse` + the two utility classes |

## Out of scope (deferred)

- Analytics on first-time-user conversion rate
- A/B test on pulse iteration count (5 vs 3 vs 8)
- Nudge cooldown after dismissal (today: dismissal lasts 3 days from next /insights visit)
- Nudge on other underused surfaces (Hooks tab, MCP tab) — same machinery would apply if we wanted to

## Risks

- **Theme tokens missing.** `var(--acc-soft)` may not exist in the current theme. Fallback chain in CSS uses `var(--acc)` if `--acc-soft` is unset.
- **Animation in dark mode.** A bright accent halo on a dark background can look like a notification badge. Verify in both themes during implementation; if dark-mode glow looks too aggressive, halve the box-shadow blur radius in a `@media (prefers-color-scheme: dark)` block.
- **`useLocation` re-render frequency.** `@tanstack/react-router`'s `useLocation` should only fire on pathname change; verify it doesn't cause the hook to re-run on every search-param change.
