# Font & Spacing Diagnosis — claude-devtools dashboard

**Date:** 2026-03-24
**URL:** http://localhost:5173/

---

## Root Cause

The `theme.extend.fontSize` custom compact scale in `tailwind.config.js` is **not taking effect**.
The default Tailwind rem-based scale is being used instead, scaled by `html { font-size: 13px }`.
Custom-only keys (`text-md`, `text-2xs`, `text-xxs`, `text-3xs`) produce **zero CSS** and silently fall back to the inherited body `13px`.

---

## Evidence — Computed vs Intended

| Class | Intended (config px) | Actual rendered | Source of actual |
|---|---|---|---|
| `text-xs` | 9px | 9.75px | `0.75rem × 13px` (default) |
| `text-sm` | 10px | 11.375px | `0.875rem × 13px` (default) |
| `text-base` | 11px | 13px | `1rem × 13px` (default) |
| `text-md` *(custom-only)* | 12px | **13px** | inherited — **no CSS generated** |
| `text-lg` | 13px | **14.625px** | `1.125rem × 13px` (default) |
| `text-xl` | 14px | 16.25px | `1.25rem × 13px` (default) |
| `text-2xl` | 15px | **19.5px** | `1.5rem × 13px` (default) |
| `text-2xs` *(custom-only)* | 7px | **13px** | inherited — **no CSS generated** |
| `text-xxs` *(custom-only)* | 8px | **13px** | inherited — **no CSS generated** |

**Key symptom:** The "Claude DevTools" title uses `text-2xl font-bold`.
Intended: `15px bold`. Actual: `19.5px bold`. **Delta: +30%** — exactly the bloat reported.

Other browser measurements:
- `devicePixelRatio`: 2 (Retina — not the cause)
- `html / body font-size`: 13px
- `py-2` computed padding: 6.5px per side (fine — spacing is not the primary issue)
- TopBar `font-size`: 14.625px instead of intended 13px
- TopBar `height`: 132px (3 rows × ~44px each)

---

## Why It Happens

In Tailwind v3, `theme.extend.fontSize` should merge with the default scale and override same-key values.
It is not doing so here — most likely a **stale Vite/PostCSS cache** that predates the config being written.
Regardless of the exact cause, the fix is identical: move `fontSize` from `extend` into the top-level `theme` key so it **replaces** the default scale instead of trying to merge with it.

---

## Fix 1 — `tailwind.config.js` (primary fix)

Move `fontSize` out of `theme.extend` into the top-level `theme`:

```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    // ✅ Top-level — replaces Tailwind defaults entirely
    fontSize: {
      "3xs": ["6px",  { lineHeight: "8px"  }],
      "2xs": ["7px",  { lineHeight: "10px" }],
      xxs:   ["8px",  { lineHeight: "12px" }],
      xs:    ["9px",  { lineHeight: "12px" }],
      sm:    ["10px", { lineHeight: "14px" }],
      base:  ["11px", { lineHeight: "16px" }],
      md:    ["12px", { lineHeight: "17px" }],
      lg:    ["13px", { lineHeight: "18px" }],
      xl:    ["14px", { lineHeight: "20px" }],
      "2xl": ["15px", { lineHeight: "20px" }],
      "3xl": ["17px", { lineHeight: "22px" }],
      "4xl": ["20px", { lineHeight: "26px" }],
    },
    extend: {
      // everything else stays in extend as before
      colors: { ... },
      fontFamily: { ... },
      spacing: { ... },
      borderRadius: { ... },
      keyframes: { ... },
      animation: { ... },
    },
  },
  plugins: [],
};
```

Then hard-restart Vite to bust the PostCSS cache:

```bash
# Kill the dev server, then:
cd dashboard && pnpm dev
```

---

## Fix 2 — Verify `globals.css` base font

Keep `html { font-size: 13px }` as-is. It is a sensible fallback for un-classed elements.
Since the custom scale uses absolute `px` values (not `rem`), this setting does not affect Tailwind utility classes after the fix.

---

## After the Fix — Expected Rendered Sizes

| Location | Class | Will render as |
|---|---|---|
| "Claude DevTools" title | `text-2xl font-bold` | **15px** (was 19.5px) |
| TopBar token counts | `text-lg` (inherited) | **13px** (was 14.625px) |
| Sidebar repo names | `text-md font-semibold` | **12px** (was 13px) |
| Sidebar metadata (branch, sessions) | `text-sm` | **10px** (was 11.375px) |
| Filter buttons (ACTIVE/ARCHIVED/ALL) | `text-xs` | **9px** (was 9.75px) |
| LIVE badge | `text-2xs font-bold` | **7px** (was 13px) |

---

## Spacing — No Change Needed

With `html: 13px`, spacing is already scaled down vs default Tailwind:

| Token | Computed | Assessment |
|---|---|---|
| `py-2` (repo item vertical pad) | 6.5px per side | compact, keep |
| `py-1.5` (session item) | 4.875px per side | compact, keep |
| `px-3` (panel header) | 9.75px per side | fine |
| `px-5` (topbar rows) | 16.25px per side | fine |

Once font sizes drop to their intended values the overall density will feel significantly tighter without touching any padding. If you still want denser sidebar rows after the fix, `py-1.5` on `.repo-item` is the next step.

---

## Summary

| | Before fix | After fix |
|---|---|---|
| `text-2xl` (title) | 19.5px | 15px |
| `text-lg` (topbar) | 14.625px | 13px |
| `text-md` (repo names) | 13px (inherited) | 12px |
| `text-sm` (metadata) | 11.375px | 10px |
| `text-2xs` (badges) | 13px (inherited) | 7px |
| **Effort** | | 1-line config change + server restart |
