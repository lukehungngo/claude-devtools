# UI/UX Validation — Anthropic Design Handoff vs Codebase

Date: 2026-05-16
Source design: `docs/design/anthropic-handoff/dashboard.html` + `colors_and_type.css`
Skill: `ui-ux-pro-max` (design-system query for "developer observability dashboard, dark mode, dense data")
Method: token diff + class-usage audit + UX rule check.

---

## TL;DR

**Strong alignment.** Token names, semantic typography classes, light/dark themes, reduced-motion handling, focus tokens, and span colors are all already present in `dashboard/src/styles/globals.css`. The codebase isn't far from the design.

**Five real gaps** worth filing — one P1 (spacing scale), one P1 (palette drift in `CASRow.tsx`), one P1 (legacy alias bloat), and two P2 polish items. None block the Background Agent / Agent Graph hardening ticket.

---

## What aligns (no action)

| Area | Status |
|---|---|
| Surface tokens `--bg / --bg-s / --bg-e / --bg-h / --bd / --bd-s` | ✅ light + dark both defined |
| Text tokens `--t1..t4` | ✅ |
| Accent `--acc / --acc-h / --acc-bg / --acc-bg-strong / --acc-glow` | ✅ all three modes (light/dark/oled) |
| Semantic `--grn / --amb / --red / --teal / --pur / --sky` (+ `-bg` variants) | ✅ |
| CI states `--ci-pass / fail / wait / run / skip / deny` | ✅ |
| Response types `--resp-working / code / tool / dispatch / think / reply / final` | ✅ |
| Span colors `--span-pm / swe / swe2 / qa / doc / bug / rev` (+ `-t` text pair) | ✅ |
| Radii `--r-xs / sm / r / md / lg / xl / pill` | ✅ |
| Type scale `--fs-3xs..display` | ✅ |
| Motion `--ease / --dur / --dur-fast / --dur-slow` | ✅ |
| Layout `--titlebar-h / --hud-h / --trace-h / --ribbon-w / --sidebar-w` | ✅ |
| Shadows `--shadow-xs / sm / md / lg / glow` (per theme) | ✅ |
| Selected-row `--bg-sel` + focus ring `--bd-focus` | ✅ (light + dark + OLED) |
| Semantic typography classes `.t-display / h1 / h2 / title / body / label / caption / eyebrow / section / mono / mono-sm / mono-xs / metric / code` | ✅ used across 80+ files |
| `@keyframes pulse` for live/run dots | ✅ |
| `prefers-reduced-motion` global override | ✅ |
| Light / Dark theme via `[data-theme]` | ✅ |

---

## Gaps

### 1. **P1 — Spacing scale missing**

Design defines a 12-step micro-scale:
```
--sp-0_5: 2px;  --sp-1: 4px;   --sp-1_5: 6px;  --sp-2: 8px;
--sp-3: 12px;   --sp-3_5: 14px; --sp-4: 16px;  --sp-4_5: 18px;
--sp-5: 20px;   --sp-6: 24px;   --sp-7: 28px;  --sp-8: 32px;
```

Our `globals.css` has **zero** spacing tokens. Result: 78+ components use raw `padding: "8px 14px"`-style values inline. There's no enforcement of the 4/8px rhythm; every component author picks their own paddings.

**Fix:** add the `--sp-*` block to `:root`. Migrate hot components first (`RepoList`, `BottomPanel`, `TurnCard`, `AgentNodeCard`).

### 2. **P1 — Raw palette hex literals in `CASRow.tsx`**

```ts
// dashboard/src/components/insights/CASRow.tsx:15-22
"#6366f1",  // Tailwind indigo-500
"#f59e0b",  // Tailwind amber-500
"#10b981",  // Tailwind emerald-500
"#ef4444",  // Tailwind red-500
...
```

These are off-system colors. The rest of the dashboard uses warm terracotta + cream + warm semantics. CASRow now pops in cool primaries that don't appear anywhere else.

**Fix:** swap to existing `--span-*` color slots (the design uses these for category coloring) or extend `--span-*` with stable category aliases (e.g. `--cat-frontend`, `--cat-backend`).

### 3. **P1 — Legacy alias bloat (20+ duplicate tokens)**

`globals.css` has parallel naming:
- `--bg-0..bg-4` ↔ `--bg / --bg-s / --bg-e / --bg-h / ...`
- `--text-0..text-2` ↔ `--t1 / --t2 / --t3`
- `--accent / --accent-hover / --accent-dim / --accent-glow` ↔ `--acc / --acc-h / --acc-bg / --acc-glow`
- `--border / --border-active / --border-subtle` ↔ `--bd / --bd-s`
- `--cyan / --purple / --orange / --pink / --rose / --sky` (only the latter three exist in design)

Both name spaces are live in components. When someone tunes `--acc` they probably forget `--accent`. **Drift is inevitable.**

**Fix:** pick canonical (recommend the short `--acc / --bd / --t1` set — matches design). Mark legacy aliases as deprecated for one release, then delete. Quick grep-and-replace.

### 4. **P2 — Naming consistency: `--focus-ring` vs design's `--ring`**

Design and our dark/light blocks both define `--ring`. Top-of-file also declares `--focus-ring` with the same value. Pick one.

### 5. **P2 — 479 inline `style={{...}}` occurrences**

Many are legitimate (dynamic widths, computed colors from data). But a non-trivial chunk repeat boilerplate like:

```tsx
style={{ padding: "8px 14px", borderBottom: "1px solid var(--bd)", fontSize: 11 }}
```

This is what semantic classes (`.t-*`) and spacing tokens (`--sp-*`) exist to prevent. After fix #1 lands, audit the worst offenders.

---

## UI/UX rule check (UX skill, web target)

| Rule | Status | Note |
|---|---|---|
| Color contrast 4.5:1 body text | Likely OK (warm cream + dark text), verify with Stark/axe in CI |
| Visible focus rings | `--ring` defined; verify every interactive element has `:focus-visible` |
| `prefers-reduced-motion` honored | ✅ global override at css:298 |
| No emoji-as-icon | Spot-checked: `lucide-react` everywhere. ✅ |
| Vector icons only | ✅ |
| Loading skeletons for >300ms ops | Partial — `RepoList` has "Loading..." text. Background Agents card needs a real skeleton. |
| Tooltips on charts on hover/tap | TrendChart uses tooltips; CASRow needs verification |
| Layout shift reserved | font-display, image dims — audit `<img>` usage |
| Tap targets ≥44px | Dashboard is desktop-first; not strictly applicable, but the small refresh/filter buttons (12-20px icons in 20×20 container) fall under 44px. Acceptable for desktop dense UI; flag for mobile. |
| Color-not-only meaning | Status dots paired with text labels in `TasksTab` and `AgentNodeCard`. ✅ |
| Semantic tokens not raw hex | ❌ — see gap #2 |

---

## Recommended action order

1. **Add `--sp-*` to `globals.css`** (Gap #1) — 10 lines, unlocks the rest of the hygiene.
2. **Replace `CASRow.tsx` palette** with `--span-*` or extend semantic tokens (Gap #2).
3. **Deprecate legacy aliases** (Gap #3) — single PR, run grep-replace, smoke-test light/dark.
4. **Rename `--focus-ring` → `--ring`** (Gap #4) — same PR as #3.
5. **Inline-style audit** (Gap #5) — pair with the Background Agent / Agent Graph hardening ticket; don't ship that polish without converting nearby inline styles.

---

## Cross-references

- Design source: `docs/design/anthropic-handoff/dashboard.html`, `colors_and_type.css`
- Hardening ticket: [`docs/plans/harden-background-agents-and-agent-graph.md`](../plans/harden-background-agents-and-agent-graph.md) — depends on this audit landing (otherwise we'll add more inline-style debt).
- Project guidance: `.claude/rules/fe-guide.md` (already says: Tailwind-first, no static `style={{}}`, named exports, `dt-*` tokens).
