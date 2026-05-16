# Phase 2 Spec — Design-system hygiene

**Loop step:** 1 of 5 · **Status:** drafting · **Owner:** main session
**Source:** `docs/design/ui-ux-validation-report.md` (Gaps #1-#4)
**Validation pass:** done — codebase token diff against `colors_and_type.css`

---

## Goal

Bring `dashboard/src/styles/globals.css` and dependent Tailwind config into single-source alignment with the Anthropic design system. No visible UI change; pure hygiene PR.

User-visible target: **zero visible diff**. Internal target: one canonical token namespace, no drifting aliases, spacing scale available for downstream tickets (Phase 4 visual rebuild).

---

## Verified ground truth

- `globals.css` is **1537 lines** with mixed canonical (`--bg`, `--acc`, `--bd`, `--t1`) + legacy (`--bg-0..4`, `--accent`, `--border`, `--text-0..2`) tokens.
- **No `--sp-*` spacing scale.** Design ships 12 steps; 78+ components use inline `padding: "Xpx Ypx"`.
- **`CASRow.tsx:14`** exports `BADGE_PALETTE` with 8 Tailwind palette hexes. Consumed by `CASRow.tsx:66` and `InsightsPage.tsx:845`. Tested in `CASRow.test.tsx:69` (asserts 8 hex colors).
- **`tailwind.config.js` maps every `dt-*` class to the LEGACY token names** (`dt-bg0` → `var(--bg-0)`, `dt-accent` → `var(--accent)`, etc.). This is the load-bearing reason aliases exist today.
- Component callsites consuming legacy vars directly:
  - `var(--accent*)` × 15
  - `var(--border*)` × 17
  - `var(--bg-0..4)` × 4
  - `var(--text-0..2)` × 8
  - `var(--cyan|purple|orange|pink|rose|sky)` × 21
  - `var(--focus-ring)` × **0** (only defined, never consumed) — easy rename
- Total directly-consumed legacy var sites: **65**. All are mechanical grep-replace candidates.

---

## Strategy: rewire the bridge, not the components

The cleanest path is **single bridge in `tailwind.config.js`** — point `dt-*` classes to canonical vars. Components keep using `dt-bg1`, `dt-accent`, etc. unchanged.

For the 65 direct `var(--legacy)` callsites in TSX, do a one-pass grep-replace to canonical names.

**Reject Path B (keep legacy as forwarders).** That keeps the drift surface alive forever; defeats the point.

---

## Scope

### 2.1 — Add `--sp-*` spacing scale to `globals.css`

Add to the `:root` block (top, alongside `--fs-*`):

```css
/* ── Spacing micro-scale (matches Anthropic design CSS) ── */
--sp-0_5: 2px;  --sp-1:   4px;  --sp-1_5: 6px;  --sp-2:   8px;
--sp-3:   12px; --sp-3_5: 14px; --sp-4:   16px; --sp-4_5: 18px;
--sp-5:   20px; --sp-6:   24px; --sp-7:   28px; --sp-8:   32px;
```

No component changes required by this step alone — tokens are now available for downstream tickets to consume.

### 2.2 — Replace `CASRow.tsx` Tailwind palette

`BADGE_PALETTE` becomes a CSS-var-driven list. Choose 8 distinct semantic colors from the existing design palette:

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

Update the test in `CASRow.test.tsx:69`:
```ts
// was: expect(BADGE_PALETTE[0]).toMatch(/^#[0-9a-f]{6}$/i);
expect(BADGE_PALETTE[0]).toMatch(/^var\(--[a-z][\w-]+\)$/);
```

### 2.3 — Deprecate alias tokens in `globals.css`

**Critical constraint from review:** `dashboard/src/lib/agentColors.ts` maps 11 distinct agent roles to the cool palette (`--cyan`, `--purple`, `--orange`, `--pink`, `--rose`, `--sky`, `--yellow`, `--green`). Collapsing these to existing semantic slots **would merge agent colors** (differential-reviewer = bug-fixer = ui-ux-designer if pink/rose → span-bug; orchestrator = main if orange → acc). **Not zero-visual-diff.** Preserve the cool palette as canonical slots.

**Split into two groups:**

**Group A — safe rename (identical hex, no semantic collision):**

| Legacy | Canonical | Notes |
|---|---|---|
| `--bg-0` | `--bg` | identical hex |
| `--bg-1` | `--bg-s` | identical |
| `--bg-2` | `--bg-e` | identical |
| `--bg-3` | `--bg-h` | identical |
| `--text-0` | `--t1` | identical |
| `--text-1` | `--t2` | identical |
| `--text-2` | `--t3` | identical |
| `--border` | `--bd` | identical |
| `--border-active` | `--bd-s` | identical |
| `--accent` | `--acc` | identical |
| `--accent-hover` | `--acc-h` | identical |
| `--accent-dim` | `--acc-bg` | identical |
| `--accent-glow` | `--acc-glow` | identical |
| `--focus-ring` | `--ring` | 0 TSX callsites |

**Group B — preserve as new canonical names (cool palette, distinct hexes, agentColors.ts depends on them):**

| Legacy | New canonical | Reason |
|---|---|---|
| `--cyan` / `--cyan-dim` | `--cat-cyan` / `--cat-cyan-bg` | distinct hex from `--teal` despite light-mode collision; dark mode differs |
| `--purple` / `--purple-dim` | `--cat-purple` / `--cat-purple-bg` | distinct from `--pur` (purple) hex in dark mode |
| `--orange` / `--orange-dim` | `--cat-orange` / `--cat-orange-bg` | distinct from `--acc` in tone semantics — orchestrator role |
| `--pink` / `--pink-dim` | `--cat-pink` / `--cat-pink-bg` | unique role color — differential-reviewer / ui-ux-designer |
| `--rose` / `--rose-dim` | `--cat-rose` / `--cat-rose-bg` | unique role color — bug-fixer |
| `--sky` / `--sky-dim` | `--sky` / `--sky-bg` | already canonical-named, just normalize the `-dim` suffix to `-bg` |
| `--yellow` / `--yellow-dim` | `--amb` / `--amb-bg` | identical hex semantically, merge with existing `--amb` |
| `--green` / `--green-dim` | `--grn` / `--grn-bg` | identical hex semantically, merge with existing `--grn` |

**`--bg-4` — special handling (review finding):**

`--bg-4` is used in 2 components (`ToolCallBlock.tsx:191` as background fill, `AgentPills.tsx:35` as badge bg) + 4 globals.css positions (scrollbar, shimmer). It is **not** semantically a border color. Hex `#D8D4CA` (light) is darker than `--bg-h` (`#E8E5DC`) and distinct from `--bd-s`. Mechanical replace would shift colors.

→ **Introduce a new canonical token `--bg-4` ≡ keep as-is (deepest surface).** Don't rename; this token has no canonical equivalent. Rename only its position in the file for grouping.

**`--border-subtle` — special handling (review finding):**

0 TSX callsites; 3 globals.css definitions with different alpha per theme (`rgba(0,0,0,.04)` light, `rgba(255,255,255,.04)` dark, `rgba(255,255,255,.08)` oled).

→ **Introduce `--bd-faint` as canonical replacement** with per-theme values. Migrate the 3 internal globals.css usages. Do not inline rgba.

### 2.4 — Update `tailwind.config.js` `dt-*` mappings to canonical vars

```js
dt: {
  // Surfaces (5 steps + selected)
  bg:     "var(--bg)",      // base
  "bg-s": "var(--bg-s)",    // surface
  "bg-e": "var(--bg-e)",    // elevated
  "bg-h": "var(--bg-h)",    // hover
  "bg-sel": "var(--bg-sel)", // selected
  // Borders
  bd:     "var(--bd)",
  "bd-s": "var(--bd-s)",
  // Text
  t1: "var(--t1)",
  t2: "var(--t2)",
  t3: "var(--t3)",
  t4: "var(--t4)",
  // Accent + state
  acc:   "var(--acc)",
  "acc-h": "var(--acc-h)",
  "acc-bg": "var(--acc-bg)",
  "acc-glow": "var(--acc-glow)",
  // Semantic
  grn:   "var(--grn)", "grn-bg": "var(--grn-bg)",
  amb:   "var(--amb)", "amb-bg": "var(--amb-bg)",
  red:   "var(--red)", "red-bg": "var(--red-bg)",
  teal:  "var(--teal)", "teal-bg": "var(--teal-bg)",
  pur:   "var(--pur)",  "pur-bg":  "var(--pur-bg)",
  sky:   "var(--sky)",  "sky-bg":  "var(--sky-bg)",
  // Spans
  "span-pm":  "var(--span-pm)",  "span-pm-t":  "var(--span-pm-t)",
  "span-swe": "var(--span-swe)", "span-swe-t": "var(--span-swe-t)",
  "span-doc": "var(--span-doc)", "span-doc-t": "var(--span-doc-t)",
  "span-qa":  "var(--span-qa)",  "span-qa-t":  "var(--span-qa-t)",
  "span-bug": "var(--span-bug)", "span-bug-t": "var(--span-bug-t)",
  "span-rev": "var(--span-rev)", "span-rev-t": "var(--span-rev-t)",
},
```

**Backward compat for `dt-bg0..4`, `dt-accent*`, `dt-border*`, `dt-text0..2`, `dt-cyan*`, etc.:**
Each existing `dt-*` class used in components (15 + 17 + 4 + 8 + 21 = 65 component callsites) needs a working Tailwind mapping. Options:

- **Path A (clean):** Update component callsites with grep-replace. Risk: 65 changes, some Tailwind classnames may be dynamic strings — must audit.
- **Path B (keep both):** Add the canonical mappings AND keep `dt-bg0..4`, `dt-accent*`, etc. mapped — both names work. Run a deprecation grep to find all callsites, migrate over multiple PRs.

**Decision: Path B for Phase 2, then Path A in a follow-up.** Reasoning: a zero-visual-diff PR shouldn't touch 65 components in a single review.

### 2.5 — Rename `--focus-ring` → `--ring`

Zero callsites in components. One definition in `globals.css`. One consumer in `tailwind.config.js` (`'dt-focus': 'var(--focus-ring)'` → `'dt-focus': 'var(--ring)'`).

Add `--ring` definition matching design (`0 0 0 2px var(--bg), 0 0 0 4px var(--acc)`), delete `--focus-ring`.

### 2.6 — Grep-replace direct `var(--legacy)` callsites in TSX

After 2.3 renames the alias defs in `globals.css`, components using `var(--accent)` etc. directly will resolve to undefined. Grep-replace:

```
# Group A — safe identity renames
var(--accent)         → var(--acc)
var(--accent-hover)   → var(--acc-h)
var(--accent-dim)     → var(--acc-bg)
var(--accent-glow)    → var(--acc-glow)
var(--bg-0)           → var(--bg)
var(--bg-1)           → var(--bg-s)
var(--bg-2)           → var(--bg-e)
var(--bg-3)           → var(--bg-h)
var(--text-0)         → var(--t1)
var(--text-1)         → var(--t2)
var(--text-2)         → var(--t3)
var(--border)         → var(--bd)
var(--border-active)  → var(--bd-s)

# Group B — cool palette: rename to canonical cat-* names (preserve hex)
var(--cyan)           → var(--cat-cyan)
var(--cyan-dim)       → var(--cat-cyan-bg)
var(--purple)         → var(--cat-purple)
var(--purple-dim)     → var(--cat-purple-bg)
var(--orange)         → var(--cat-orange)
var(--orange-dim)     → var(--cat-orange-bg)
var(--pink)           → var(--cat-pink)
var(--pink-dim)       → var(--cat-pink-bg)
var(--rose)           → var(--cat-rose)
var(--rose-dim)       → var(--cat-rose-bg)
var(--sky-dim)        → var(--sky-bg)
var(--yellow)         → var(--amb)
var(--yellow-dim)     → var(--amb-bg)
var(--green)          → var(--grn)
var(--green-dim)      → var(--grn-bg)

# Special — keep as-is
var(--bg-4)           → var(--bg-4)    # unchanged, deepest surface
var(--border-subtle)  → var(--bd-faint) # canonical replacement
```

**Update `dashboard/src/lib/agentColors.ts`** to use the new `--cat-*` names:

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
```

Same shape for `KNOWN_DIM_COLORS` with `-bg` suffix.

---

## API contract

No runtime API changes. CSS variables + Tailwind config + one component file.

---

## Acceptance criteria

### Visual

- [ ] **Pixel-perfect diff** of the dashboard before/after Phase 2 across all top-level routes. Run Playwright screenshot comparison; zero meaningful diffs in light + dark + OLED themes.
- [ ] Theme switching still works in all three modes.
- [ ] CASRow badges render with terracotta/cream-family colors instead of cool primaries.

### Code

- [ ] `globals.css` no longer defines any of: `--bg-0..4`, `--text-0..2`, `--accent*`, `--border*` (except `--bd*` canonical), `--cyan*`, `--purple*`, `--orange*`, `--pink*`, `--rose*`, `--focus-ring`.
- [ ] `globals.css` defines `--sp-*` × 12 in `:root` block.
- [ ] `globals.css` defines `--ring` (formerly `--focus-ring`).
- [ ] `tailwind.config.js` `dt-*` mappings point to canonical vars (Path B: legacy names also retained, with `@deprecated` comment).
- [ ] `CASRow.tsx` `BADGE_PALETTE` is var-based; `CASRow.test.tsx` accepts var syntax.
- [ ] Zero `var(--accent` / `var(--bg-0` / `var(--text-0` / `var(--border)` / `var(--cyan` / `var(--purple` / `var(--orange` / `var(--pink` / `var(--rose` / `var(--focus-ring` matches in TSX. Grep clean.

### Test

- [ ] `pnpm -C dashboard test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `pnpm -C server test` green (no server impact expected, sanity only).
- [ ] No new lint warnings.
- [ ] `CASRow.test.tsx`: add a runtime smoke that `getComputedStyle` resolves the var-based color to a non-empty value (not just regex shape).
- [ ] Follow-up ticket filed in `docs/plans/ux-backlog.md` for the `dt-bg0..4` / `dt-accent*` Tailwind class migration. **Filed before merge.**

---

## Out of scope (Phase 2)

- Migrating `dt-bg0` → `dt-bg` and similar Tailwind classnames in components (deferred — separate PR, large surface).
- Replacing inline `padding: "8px 14px"` with `var(--sp-*)` (Phase 4 visual rebuild handles per-component).
- New spacing utility classes.
- Cookbook component refresh.

---

## Risks

- **65 direct legacy var callsites** must all be caught by the grep-replace. One miss = invisible element (var resolves to undefined → empty background). Mitigation: dry-run grep before/after; verify count drops to zero in `src/components` + `src/routes`.
- **`--bg-4` is intentionally preserved.** Two component callsites + four globals.css positions unchanged.
- **`--border-subtle` → `--bd-faint`** with per-theme alpha values preserved (light/dark/oled distinct).
- **Cool palette preserved as `--cat-*`.** `agentColors.ts` updated in same PR; no role color merging.
- **Tailwind class drift (Path B).** `dt-bg0..4`, `dt-accent*`, etc. continue to work via dual mapping. Follow-up ticket to migrate components is **required** before merge — file in `docs/plans/ux-backlog.md`.

## Rollback

Single revert of the Phase 2 PR. Do **not** cherry-pick per-token reverts — the `dt-*` Tailwind config, `globals.css`, `agentColors.ts`, and `CASRow.tsx` changes are co-dependent.

---

## Loop status

- [x] Step 1: Spec drafted
- [x] Step 2: Spec review — **REVISE issued, all 6 concerns applied:**
  - Cool palette PRESERVED as `--cat-*` (not collapsed) — was the biggest fix
  - `agentColors.ts` update added to scope
  - `--bg-4` kept as canonical, not renamed (semantic mismatch averted)
  - `--bd-faint` introduced for per-theme `--border-subtle` replacement
  - Rollback plan added (single revert, no per-token)
  - Runtime computed-style smoke added to CASRow test
  - Follow-up ticket required pre-merge for Tailwind class migration
- [x] Step 3: Implementation plan → `docs/plans/phase-2-impl-plan.md` (T1-T11)
- [ ] Step 4: Execute (blocked: other agent on repo)
- [ ] Step 5: Gap review
