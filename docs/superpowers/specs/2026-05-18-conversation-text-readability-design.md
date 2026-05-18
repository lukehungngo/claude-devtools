# Conversation Panel Text Readability — Design

**Status:** Approved scope (A2 — class bumps + inline sweep)
**Date:** 2026-05-18
**Scope:** Dashboard conversation panel only — body text utility classes in `globals.css` plus inline `fontSize` numeric values inside `dashboard/src/components/conversation/*` and `dashboard/src/components/viewer/*`.

## Problem

The dashboard's `tailwind.config.js` defines a downscaled font-size system where `text-base` = 11px (not the standard 16px). Combined with custom utility classes `.t-body` (13px) and `.t-mono-xs` (9px), the conversation panel renders most secondary text at 9-11px — below practical readability for prolonged reading on Retina displays at typical viewing distance.

Concrete examples observed:
- Model badge ("Claude · sonnet-4-6") renders at **9px**
- Background agent rows render at **9px**
- Tool entry file paths render at **11px** (inline `fontSize: 11`)
- Task grid items render at **9px**
- Turn completion footer renders at **10px**

WCAG AA practical floor is 14px for body text. Apple HIG default is 17px. The conversation panel is the primary surface of the dashboard, used for sustained reading — the current sizes are objectively too small.

## Goals

1. Raise the four conversation-relevant text utility classes (`.t-body`, `.t-mono`, `.t-mono-sm`, `.t-mono-xs`) by 2px each, with proportional line-height adjustments.
2. Sweep inline numeric `fontSize` values inside `components/conversation/*` and `components/viewer/*` by the same +2px (capped at 15) so the conversation panel becomes uniformly readable.
3. Leave everything else alone — sidebar, top bar, Insights page, bottom panel — to keep the change surgically scoped and avoid dashboard-wide reflow.

## Non-goals

- Recalibrate Tailwind's `text-*` scale globally (path B — deferred).
- Modify `text-xs / text-sm / text-base` Tailwind class usages anywhere. Those classes are shared with non-conversation surfaces.
- Change colors, weights, font families, or layout spacing.

## Design

### Part 1 — Utility class bumps (`dashboard/src/styles/globals.css`)

Four edits, locations at lines 607-621:

```css
.t-body {
  font-family: var(--font-sans);
  font-size: 15px;        /* was 13px */
  line-height: 1.65;
  color: var(--t1);
}

.t-mono {
  font-family: var(--font-mono);
  font-size: 13px;        /* was 11px */
  line-height: 18px;      /* was 16px */
  color: var(--t1);
}

.t-mono-sm {
  font-family: var(--font-mono);
  font-size: 12px;        /* was 10px */
  line-height: 16px;      /* was 14px */
  color: var(--t2);
}

.t-mono-xs {
  font-family: var(--font-mono);
  font-size: 11px;        /* was 9px */
  line-height: 14px;      /* was 12px */
  color: var(--t3);
}
```

Rationale for chosen sizes:
- `.t-body` → 15px lands between Material body-medium (14px) and body-large (16px), comfortable for sustained reading without overwhelming dense areas.
- `.t-mono-xs` → 11px is still small but now legible at typical viewing distance. Going larger would dominate badge/label slots.
- Line-heights on mono classes track the +2px font bump (+2px line-height for `.t-mono` and `.t-mono-sm`, +2px for `.t-mono-xs`) to preserve vertical rhythm.
- `.t-body` keeps `line-height: 1.65` (unitless multiplier) because it scales with the new font size automatically.

### Part 2 — Inline `fontSize` sweep

Rule: in every file under `dashboard/src/components/conversation/` and `dashboard/src/components/viewer/`, any inline `fontSize: <N>` where `N ∈ {9, 10, 11, 12, 13}` is bumped to `N + 2`. Values ≥14 are unchanged.

Files and counts (from `grep -nE "fontSize:\s*[0-9]+\b"` audit):

| File | Lines touched | Distinct values | After |
|---|---|---|---|
| `conversation/ToolEntries.tsx` | 10 | 9, 10, 11 | 11, 12, 13 |
| `conversation/TaskGrid.tsx` | 6 | 9 | 11 |
| `conversation/RawLogView.tsx` | 5 | 9, 10, 11 | 11, 12, 13 |
| `conversation/PhaseGroup.tsx` | 4 | 9, 12, 13 | 11, 13(=14 cap'd to 14? — see note), 15 |
| `conversation/AutoDenialBlock.tsx` | 2 | 10 | 12 |
| `conversation/PromptInput.tsx` | 4 | 12, 13 | 14, 15 |

Note on the cap: the cap kicks in at 15. Values 12 → 14 and 13 → 15 are within the rule. The cap exists to prevent runaway when this sweep is applied to a value that's already comfortable (we have no values 14-15 in this file set today; the cap is defensive future-proofing).

Lookup table (for the implementing engineer — strict):

```
9  → 11
10 → 12
11 → 13
12 → 14
13 → 15
14 → 14  (no change)
15 → 15  (no change)
```

Apply via search-and-replace per file. Verify each occurrence is a numeric `fontSize:` (not a variable or string).

### Part 3 — Out of scope (documented for transparency)

The following text sources in the conversation panel are NOT changed by this design:

- **Tailwind `text-xs / text-sm / text-base` class usages** in `AgentCard.tsx`, `BackgroundAgentGroup.tsx` (header counts), and similar components. These classes are shared with non-conversation surfaces. Touching them requires a wider audit (path B).
- **`fontSize: 14+` inline values** are presumed already comfortable.
- **CSS variables** like `var(--fs-md)`, `var(--fs-base)`, `var(--fs-display)` used in a small number of places. These are part of the design-token system and out of scope here.

## Test plan

This is a CSS + numeric-literal sweep with no behavior change. The verification model is mostly visual, with two automated guards:

### Unit / static checks

- [ ] `pnpm test` — full dashboard suite must remain green. No test mocks `font-size` or computed style, so this confirms no logical regressions.
- [ ] `npx tsc --noEmit` — clean (numeric edits in JSX style props don't change types).
- [ ] `eslint` — clean.

### Static assertion (one new test)

Add a single unit test asserting the four utility-class sizes are present in the CSS source. This is a brittle but quick regression guard.

```ts
// dashboard/src/styles/globals.test.ts (new file)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("conversation text utility classes — readability sizes", () => {
  const cases: Array<[string, string]> = [
    [".t-body",     "font-size: 15px"],
    [".t-mono",     "font-size: 13px"],
    [".t-mono-sm",  "font-size: 12px"],
    [".t-mono-xs",  "font-size: 11px"],
  ];
  for (const [cls, decl] of cases) {
    it(`${cls} declares ${decl}`, () => {
      const block = css.split(cls)[1]?.split("}")[0] ?? "";
      expect(block).toContain(decl);
    });
  }
});
```

### Manual visual check

- [ ] Run `pnpm -C dashboard dev`, open a session with at least 1 background agent dispatch and several tool calls.
- [ ] Confirm: model badge readable without leaning in. Background agent row text is legible. Tool entry file paths read comfortably. Turn completion footer is comfortable. User prompt bubble and assistant response feel like body text, not status text.
- [ ] Cross-check: Insights page (`/insights`), top bar tabs, sidebar repo list, bottom panel — these should look IDENTICAL to before. If they don't, the sweep accidentally hit a shared utility.

## Risks

| Risk | Mitigation |
|---|---|
| Line wrapping changes break dense layouts | `.t-mono-xs` is used in `BackgroundAgentGroup` rows with fixed `minWidth: 56/48`. The 2px bump may push two-line wrap. Verify visually; if needed, widen the `minWidth` columns by 8-12px. |
| Tool entry one-line-per-call view truncates differently | `ToolEntries.tsx` uses `whitespace-nowrap` + `overflow-hidden text-ellipsis`. Truncation is preserved; only the ellipsis kicks in slightly earlier. Acceptable. |
| AgentCard / BackgroundAgentGroup mismatched sizes | These mix `text-xs` (Tailwind = 9px, unchanged) with `t-mono-xs` (now 11px) within the same row. The mismatch existed before but was less visible because both were ~9-10px. Will become more visible. Out-of-scope to fix in this change — flag for follow-up audit. |
| `.t-body` is used outside conversation | A grep check (`rg "\\bt-body\\b" dashboard/src`) should produce zero hits outside `components/conversation/*`. If any leak exists, the bump is benign (15px is universally more readable than 13px) but should be noted. |

## Files changed

| File | Change |
|---|---|
| `dashboard/src/styles/globals.css` | Bump font-size + line-height on `.t-body`, `.t-mono`, `.t-mono-sm`, `.t-mono-xs` |
| `dashboard/src/styles/globals.test.ts` (new) | Assert the four utility classes carry the new sizes |
| `dashboard/src/components/conversation/ToolEntries.tsx` | `fontSize: 9/10/11` → `11/12/13` (10 occurrences) |
| `dashboard/src/components/conversation/TaskGrid.tsx` | `fontSize: 9` → `11` (6 occurrences) |
| `dashboard/src/components/conversation/RawLogView.tsx` | `fontSize: 9/10/11` → `11/12/13` (5 occurrences) |
| `dashboard/src/components/conversation/PhaseGroup.tsx` | `fontSize: 9/12/13` → `11/14/15` (4 occurrences) |
| `dashboard/src/components/conversation/AutoDenialBlock.tsx` | `fontSize: 10` → `12` (2 occurrences) |
| `dashboard/src/components/conversation/PromptInput.tsx` | `fontSize: 12/13` → `14/15` (4 occurrences) |
| (viewer/) | Audit confirmed zero conversation-related inline `fontSize` outside `components/conversation/*`. No viewer changes needed. |

Total: ~31 numeric edits + 1 new test file + 4 CSS edits.
