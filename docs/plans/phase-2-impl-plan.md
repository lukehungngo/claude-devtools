# Phase 2 Implementation Plan

**Spec:** `docs/specs/phase-2-design-hygiene.md` (Step 2 approved with REVISE → fixes applied)
**Status:** ready · **Owner:** main session · **Blocked on:** other agent on repo

---

## Pre-flight

```bash
cd /Users/soh/working/ai/claude-devtools
git status
git diff dashboard/src/styles/globals.css
git diff dashboard/tailwind.config.js
git diff dashboard/src/lib/agentColors.ts
git diff dashboard/src/components/insights/CASRow.tsx
```

If concurrent edits exist on any target file, STOP and rebase before continuing.

---

## Tasks (sequential — visual regression risk drives order)

### T1 — Baseline screenshots (pre-change)

```bash
cd dashboard
pnpm dev   # starts on :3142
# In a separate terminal:
pnpm exec playwright screenshot http://localhost:3142/ /tmp/phase2-pre-home.png --viewport-size=1440,900
pnpm exec playwright screenshot http://localhost:3142/insights /tmp/phase2-pre-insights.png --viewport-size=1440,900
# Capture both themes:
# Toggle theme via local storage, repeat for dark + oled
```

Optional if Playwright isn't set up: defer to manual visual check in T11.

### T2 — Add `--sp-*` and `--ring` to `globals.css`

**File:** `dashboard/src/styles/globals.css`

In `:root` block, after `--fs-*`:

```css
/* ── Spacing micro-scale (matches Anthropic design system) ── */
--sp-0_5: 2px;  --sp-1:   4px;  --sp-1_5: 6px;  --sp-2:   8px;
--sp-3:   12px; --sp-3_5: 14px; --sp-4:   16px; --sp-4_5: 18px;
--sp-5:   20px; --sp-6:   24px; --sp-7:   28px; --sp-8:   32px;
```

Rename `--focus-ring` → `--ring` (only 1 def, no TSX callsites).

Acceptance: `git diff dashboard/src/styles/globals.css` shows additions of 12 spacing tokens + 1 rename. Build still works.

### T3 — Introduce `--bd-faint` and new `--cat-*` palette

**File:** `dashboard/src/styles/globals.css`

In each theme block (`:root` light, `[data-theme="dark"]`, `[data-theme="oled"]`):

```css
/* light */
--bd-faint: rgba(0,0,0,.04);
--cat-cyan:    var(--cyan);     /* alias for now — preserves hex */
--cat-cyan-bg: var(--cyan-dim);
--cat-purple:  var(--purple);
--cat-purple-bg: var(--purple-dim);
--cat-orange:  var(--orange);
--cat-orange-bg: var(--orange-dim);
--cat-pink:    var(--pink);
--cat-pink-bg: var(--pink-dim);
--cat-rose:    var(--rose);
--cat-rose-bg: var(--rose-dim);
--sky-bg: var(--sky-dim);  /* normalize -dim → -bg suffix */

/* dark and oled — same pattern, distinct values */
```

Step 3 introduces canonical names that **forward** to legacy. This preserves pixel-identical visuals during the rename, before T4 removes legacy.

Acceptance: no visual diff yet (all canonical vars resolve to same value as legacy via forwarding). Test suite green.

### T4 — Update `agentColors.ts` to canonical names

**File:** `dashboard/src/lib/agentColors.ts`

```ts
const KNOWN_COLORS: Record<string, string> = {
  main: "var(--acc)",
  Explore: "var(--cat-cyan)",
  Plan: "var(--amb)",
  "general-purpose": "var(--grn)",
  General: "var(--grn)",
  orchestrator: "var(--cat-orange)",
  engineer: "var(--teal)",
  reviewer: "var(--cat-purple)",
  "bug-fixer": "var(--cat-rose)",
  researcher: "var(--sky)",
  "differential-reviewer": "var(--cat-pink)",
  "ui-ux-designer": "var(--cat-pink)",
};

const KNOWN_DIM_COLORS: Record<string, string> = {
  main: "var(--acc-bg)",
  Explore: "var(--cat-cyan-bg)",
  Plan: "var(--amb-bg)",
  "general-purpose": "var(--grn-bg)",
  General: "var(--grn-bg)",
  orchestrator: "var(--cat-orange-bg)",
  engineer: "var(--teal-bg)",
  reviewer: "var(--cat-purple-bg)",
  "bug-fixer": "var(--cat-rose-bg)",
  researcher: "var(--sky-bg)",
  "differential-reviewer": "var(--cat-pink-bg)",
  "ui-ux-designer": "var(--cat-pink-bg)",
};
```

Acceptance: existing `agentColors.test.ts` (if any) stays green. Visual diff: agent badges unchanged (forwarding still active).

### T5 — Update `CASRow.tsx` BADGE_PALETTE

**File:** `dashboard/src/components/insights/CASRow.tsx`

```ts
export const BADGE_PALETTE = [
  "var(--span-pm)",
  "var(--span-swe)",
  "var(--span-doc)",
  "var(--span-qa)",
  "var(--span-bug)",
  "var(--span-rev)",
  "var(--span-swe2)",
  "var(--teal)",
];
```

**File:** `dashboard/src/components/insights/CASRow.test.tsx`

```ts
it("BADGE_PALETTE has 8 var-based colors", () => {
  expect(BADGE_PALETTE).toHaveLength(8);
  expect(BADGE_PALETTE[0]).toMatch(/^var\(--[a-z][\w-]+\)$/);
});

it("BADGE_PALETTE values resolve to non-empty computed style", () => {
  const div = document.createElement("div");
  div.style.background = BADGE_PALETTE[0];
  document.body.appendChild(div);
  const computed = getComputedStyle(div).backgroundColor;
  expect(computed).not.toBe("");
  expect(computed).not.toBe("rgba(0, 0, 0, 0)");
  div.remove();
});
```

Acceptance: tests green. **Visible change:** CASRow badges shift from cool primaries to terracotta/cream palette. This is the one intentional visual change in Phase 2 (Gap #2).

### T6 — Grep-replace direct legacy var callsites in TSX

Run mechanical replaces (use ripgrep + sed or single-file edits):

```bash
cd dashboard
# Group A — identity rename
fd -e tsx -e ts . src/components src/routes -x sed -i '' \
  -e 's/var(--accent-glow)/var(--acc-glow)/g' \
  -e 's/var(--accent-dim)/var(--acc-bg)/g' \
  -e 's/var(--accent-hover)/var(--acc-h)/g' \
  -e 's/var(--accent)/var(--acc)/g' \
  -e 's/var(--bg-0)/var(--bg)/g' \
  -e 's/var(--bg-1)/var(--bg-s)/g' \
  -e 's/var(--bg-2)/var(--bg-e)/g' \
  -e 's/var(--bg-3)/var(--bg-h)/g' \
  -e 's/var(--text-0)/var(--t1)/g' \
  -e 's/var(--text-1)/var(--t2)/g' \
  -e 's/var(--text-2)/var(--t3)/g' \
  -e 's/var(--border-active)/var(--bd-s)/g' \
  -e 's/var(--border-subtle)/var(--bd-faint)/g' \
  -e 's/var(--border)/var(--bd)/g' \
  -e 's/var(--focus-ring)/var(--ring)/g'

# Group B — cool palette to cat-*
fd -e tsx -e ts . src/components src/routes -x sed -i '' \
  -e 's/var(--cyan-dim)/var(--cat-cyan-bg)/g' \
  -e 's/var(--cyan)/var(--cat-cyan)/g' \
  -e 's/var(--purple-dim)/var(--cat-purple-bg)/g' \
  -e 's/var(--purple)/var(--cat-purple)/g' \
  -e 's/var(--orange-dim)/var(--cat-orange-bg)/g' \
  -e 's/var(--orange)/var(--cat-orange)/g' \
  -e 's/var(--pink-dim)/var(--cat-pink-bg)/g' \
  -e 's/var(--pink)/var(--cat-pink)/g' \
  -e 's/var(--rose-dim)/var(--cat-rose-bg)/g' \
  -e 's/var(--rose)/var(--cat-rose)/g' \
  -e 's/var(--sky-dim)/var(--sky-bg)/g' \
  -e 's/var(--yellow-dim)/var(--amb-bg)/g' \
  -e 's/var(--yellow)/var(--amb)/g' \
  -e 's/var(--green-dim)/var(--grn-bg)/g' \
  -e 's/var(--green)/var(--grn)/g'
```

**Verify zero remaining matches:**
```bash
grep -rE "var\(--(accent|bg-[0-3]|text-[0-2]|border|focus-ring|cyan|purple|orange|pink|rose|yellow|green)\b" src/components src/routes
```

Should output nothing. Note: `var(--bg-4)` and `var(--bg-h)` etc. are left untouched (different patterns).

Acceptance: grep returns empty. TypeScript compiles.

### T7 — Update `tailwind.config.js`

**File:** `dashboard/tailwind.config.js`

Add new canonical `dt-*` mappings (Path B keeps legacy too):

```js
dt: {
  // ── Canonical (new) ──
  bg:       "var(--bg)",
  "bg-s":   "var(--bg-s)",
  "bg-e":   "var(--bg-e)",
  "bg-h":   "var(--bg-h)",
  "bg-sel": "var(--bg-sel)",
  bd:       "var(--bd)",
  "bd-s":   "var(--bd-s)",
  "bd-faint": "var(--bd-faint)",
  t1: "var(--t1)", t2: "var(--t2)", t3: "var(--t3)", t4: "var(--t4)",
  acc: "var(--acc)", "acc-h": "var(--acc-h)", "acc-bg": "var(--acc-bg)", "acc-glow": "var(--acc-glow)",
  grn: "var(--grn)", "grn-bg": "var(--grn-bg)",
  amb: "var(--amb)", "amb-bg": "var(--amb-bg)",
  red: "var(--red)", "red-bg": "var(--red-bg)",
  teal: "var(--teal)", "teal-bg": "var(--teal-bg)",
  pur: "var(--pur)", "pur-bg": "var(--pur-bg)",
  sky: "var(--sky)", "sky-bg": "var(--sky-bg)",
  // ── Category palette (preserves agent role colors) ──
  "cat-cyan": "var(--cat-cyan)", "cat-cyan-bg": "var(--cat-cyan-bg)",
  "cat-purple": "var(--cat-purple)", "cat-purple-bg": "var(--cat-purple-bg)",
  "cat-orange": "var(--cat-orange)", "cat-orange-bg": "var(--cat-orange-bg)",
  "cat-pink": "var(--cat-pink)", "cat-pink-bg": "var(--cat-pink-bg)",
  "cat-rose": "var(--cat-rose)", "cat-rose-bg": "var(--cat-rose-bg)",

  // ── DEPRECATED — preserved for Tailwind class compat (see ux-backlog.md follow-up ticket) ──
  bg0: "var(--bg)",       bg1: "var(--bg-s)",     bg2: "var(--bg-e)",
  bg3: "var(--bg-h)",     bg4: "var(--bg-4)",
  text0: "var(--t1)",     text1: "var(--t2)",     text2: "var(--t3)",
  border: "var(--bd)",    "border-active": "var(--bd-s)", "border-subtle": "var(--bd-faint)",
  accent: "var(--acc)",   "accent-dim": "var(--acc-bg)",
  "accent-hover": "var(--acc-h)",  "accent-glow": "var(--acc-glow)",
  cyan: "var(--cat-cyan)", "cyan-dim": "var(--cat-cyan-bg)",
  purple: "var(--cat-purple)", "purple-dim": "var(--cat-purple-bg)",
  orange: "var(--cat-orange)", "orange-dim": "var(--cat-orange-bg)",
  pink: "var(--cat-pink)", "pink-dim": "var(--cat-pink-bg)",
  rose: "var(--cat-rose)", "rose-dim": "var(--cat-rose-bg)",
  yellow: "var(--amb)", "yellow-dim": "var(--amb-bg)",
  green: "var(--grn)", "green-dim": "var(--grn-bg)",
  "sky-dim": "var(--sky-bg)",
},
boxShadow: {
  'dt-sm': 'var(--shadow-sm)',
  'dt-md': 'var(--shadow-md)',
  'dt-lg': 'var(--shadow-lg)',
  'dt-glow': 'var(--shadow-glow)',
  'dt-focus': 'var(--ring)',  // was --focus-ring
},
```

Acceptance: build succeeds. All existing `dt-*` classnames still resolve.

### T8 — Delete legacy var defs from `globals.css`

**File:** `dashboard/src/styles/globals.css`

In every theme block (`:root, [data-theme="light"]`, `[data-theme="dark"]`, `[data-theme="oled"]`), remove the legacy `--bg-0..3`, `--text-0..2`, `--border`, `--border-active`, `--border-subtle`, `--accent*`, `--cyan*`, `--purple*`, `--orange*`, `--pink*`, `--rose*`, `--sky-dim`, `--yellow*`, `--green*`, `--focus-ring` definitions.

**Keep `--bg-4` definitions** (intentional preservation).

Acceptance:
```bash
grep -cE "^\s+--(accent|bg-[0-3]|text-[0-2]|border|focus-ring|cyan|purple|orange|pink|rose|yellow|green)\b" src/styles/globals.css
# Should output 0
```

### T9 — File follow-up ticket in `ux-backlog.md`

**File:** `docs/plans/ux-backlog.md`

Add:
```markdown
### 2. Migrate Tailwind `dt-bg0..4 / dt-accent* / dt-cyan / dt-pink` classnames to canonical `dt-bg / dt-acc / dt-cat-cyan / dt-cat-pink`

- **Why:** Phase 2 retained dual mappings to avoid 65-component diff in a hygiene PR. Long-term we want one classname per token.
- **Where:** every `*.tsx` in `dashboard/src/components` + `dashboard/src/routes`.
- **How:** grep for `\bdt-(bg[0-4]|accent|text[0-2]|border|cyan|purple|orange|pink|rose|yellow|green)\b` and rewrite.
- **Acceptance:** zero deprecated classnames remain; remove `DEPRECATED` block from `tailwind.config.js`; snapshot diff still zero.
```

### T10 — Typecheck + test + lint

```bash
cd dashboard
npx tsc --noEmit
pnpm -C dashboard test
pnpm -C server test    # sanity
```

All green.

### T11 — Visual diff verification

Repeat T1 screenshots after all changes. Compare manually side-by-side OR use `pixelmatch` if Playwright is wired. **Expected diffs:**
- CASRow badges shift from cool primaries to terracotta/cream-family
- Nothing else

If any other component shows a diff, STOP and gap-review.

---

## Risk gates

| Gate | Pass | Fail |
|---|---|---|
| T2 — tokens added | build green | revise spec |
| T3 — forwarding active | visual unchanged | confirm cascade order |
| T4 — agentColors swap | role colors unchanged | check agentColors test |
| T5 — CASRow | new badges + tests green | re-pick palette |
| T6 — grep clean | zero matches | manual fix missed sites |
| T7 — Tailwind config | classes still resolve | check dual-mapping |
| T8 — legacy deleted | zero `--accent` etc. in css | re-grep |
| T9 — follow-up filed | ticket in backlog | block merge |
| T10 — typecheck/test/lint | clean | fix per error |
| T11 — visual diff | only CASRow changed | gap review |

---

## Out of scope (re-confirmed)

- Migrating `dt-bg0..4` Tailwind classnames in components (follow-up ticket from T9)
- Replacing inline `padding: "Xpx Ypx"` literals with `var(--sp-*)` (Phase 4)
- New utility classes
- Visual polish to component layouts

---

## Execution mode

- **No subagent needed.** Changes are ~600 LOC across 4 files. Mechanical, single context.
- **Single PR scope.** All T1-T11 atomic. Splitting T6 from T8 leaves legacy + canonical names live simultaneously, which is fine, but the PR shouldn't ship until T8 is done — otherwise the cleanup goal isn't met.
- **Coordination with Phase 1:** Phase 1 touches `sessionTasks.ts`, `BottomPanel.tsx`, `ConversationView.tsx` — disjoint from Phase 2. Can land in parallel after the other agent merges.
