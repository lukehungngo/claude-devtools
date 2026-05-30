# Phase 6 Spec — Running-row animation in Agent Graph

**Loop step:** spec drafted (Option B approved) · **Status:** ready for impl plan
**Source design:** ui-ux-pro-max §7 Animation rules + Anthropic design CSS `.arow.live`

---

## Goal

When an agent row in the bottom-panel Agent Graph (`TraceTab`) has
`status === "active"`, the row visibly conveys "still working" through two
GPU-only motion cues — a sweeping highlight on the timeline bar and a pulsing
accent stripe on the row's left edge.

Currently a tiny `.running-dot` inside the bar is the only motion. It's
easy to miss when bars are short or many rows are visible.

---

## Verified constraints

From ui-ux-pro-max §7 Animation:

- **`transform-performance`** — animate `transform` + `opacity` only.
- **`duration-timing`** — 150–300ms micro; ambient state-indicator 1.5–2s
  range acceptable for continuous "still working" cues.
- **`motion-meaning`** — animation must signal cause-effect (active → motion),
  not be decoration.
- **`excessive-motion`** — max 1–2 animated elements per state. Two cues on
  the same row tied to the same `isActive` state stays within budget.
- **`reduced-motion`** — must respect `prefers-reduced-motion: reduce`.
  Already handled globally in `dashboard/src/styles/globals.css:1392`.
- **`layout-shift-avoid`** — zero reflow; no width/height/top/left.

From codebase audit:

- `isActive = node.status === "active"` in `TraceTab.tsx:380`.
- Row className composed at `TraceTab.tsx:388`.
- Bar element has `.trace-bar` class (`.trace-track > .trace-bar`).
- `.trace-bar-running` already exists (renders the `.running-dot` + label).
- Themes: light/dark/oled defined; `--acc` resolves per theme.

---

## Scope

### 6.1 — Row left-edge stripe pulse

Add `trace-row-active` modifier class on `.trace-row` when `isActive === true`.
Use a `::before` pseudo-element pinned to the row's left edge:

```css
.trace-row-active {
  position: relative;
}
.trace-row-active::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: var(--acc);
  pointer-events: none;
  animation: trace-row-active-pulse 2s ease-in-out infinite;
}
@keyframes trace-row-active-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
```

### 6.2 — Bar sweep highlight

Add `trace-bar-active` modifier class on `.trace-bar` when `isActive === true`.
Use a `::after` pseudo-element with translateX gradient:

```css
.trace-bar-active {
  position: relative;
  overflow: hidden;
}
.trace-bar-active::after {
  content: "";
  position: absolute;
  top: 0; bottom: 0;
  left: 0;
  width: 30%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.18) 50%,
    transparent 100%
  );
  pointer-events: none;
  animation: trace-bar-sweep 1.8s ease-in-out infinite;
  /* Sit below the .trace-bar-running label, above the bar's solid fill */
  z-index: 1;
}
@keyframes trace-bar-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

Note: highlight is white at 18% in light theme. Verify in dark theme — the
`var(--acc)` bar background is `#D97757` (peach), so a white sweep at 18%
reads correctly. No theme-conditional values needed.

### 6.3 — Wire the classes in TraceTab.tsx

```tsx
const rowClass = `trace-row${isToolCall ? " trace-row-tool" : ""}${
  selected ? " trace-row-selected" : ""
}${isActive ? " trace-row-active" : ""}`;

// inside <div className="trace-bar" …>
className={`trace-bar${isActive ? " trace-bar-active" : ""}`}
```

The existing `.trace-bar-running > .running-dot` inside the bar continues to
render — we layer the sweep behind it (z-index: 0 vs 1).

---

## Acceptance criteria

### Visual

- [ ] Row with `status === "active"` shows a 2px terracotta/peach stripe on the
      left edge, breathing 1.0 → 0.45 → 1.0 opacity over 2s.
- [ ] Same row's timeline bar shows a soft sweeping highlight moving
      left-to-right every 1.8s.
- [ ] Inactive rows (`completed`/`error`) have neither.
- [ ] Both animations stop instantly when the agent transitions from
      `active` → `completed`/`error` (class toggle is enough).
- [ ] No layout shift on row when toggling active state — verify via DevTools
      "Paint flashing" or by measuring scroll position pre/post toggle.

### Performance

- [ ] DevTools Performance trace during 30s of animation: zero forced reflow
      events on `.trace-row-active` or `.trace-bar-active`.
- [ ] Compositor-only paints (animation runs on the GPU thread).

### Accessibility

- [ ] With macOS "Reduce Motion" enabled, both animations are static
      (sweep parked at translateX(-100%), stripe at opacity: 1).
- [ ] Color is not the only cue — "running" text inside the bar remains.

### Test

- [ ] New unit test: `TraceTab` rendered with an `active` node has
      `.trace-row-active` class on its row and `.trace-bar-active` class on its
      bar. Same node when `completed` has neither.

---

## Risks

- **Visibility regression for "active" state vs "selected" state** —
  `.trace-row-selected` already exists for click selection. The stripe is on
  the left edge; selected row uses background tint. They shouldn't conflict.
  Verify by selecting an active row — both styles should coexist.
- **Dark theme contrast** — sweep is 18% white over peach `#D97757` bar.
  Verify the highlight is perceptible but not blown-out.
- **Heavy concurrent motion** — at 22 dispatched agents (screenshot session),
  22 stripes pulsing in sync at the same phase is visually loud. v1 accepts
  this; if user reports overload, switch to opacity 0.7→1.0 (less swing) or
  stagger via `animation-delay: calc(var(--row-index, 0) * 100ms)`.

---

## Out of scope

- Bar shrinking/growing as duration extends (would reflow).
- Color shift mid-animation.
- Background blur effects.
- Sound / haptic feedback.

---

## Loop status

- [x] Step 1: Spec drafted with Option B approval
- [x] Step 2: Reviewed against ui-ux-pro-max §7 + Anthropic design
- [ ] Step 3: Implementation plan
- [ ] Step 4: Execute
- [ ] Step 5: Gap review
