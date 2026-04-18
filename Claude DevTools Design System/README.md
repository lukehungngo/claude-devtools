# Claude DevTools Design System

A design system reconstructed from the `lukehungngo/claude-devtools` repo — a web-based Claude Code client with live agent observability.

## The product

**Claude DevTools** is a debugging & monitoring dashboard for Claude Code agents. It's a developer's desk tool: a local monorepo that pairs an MCP server (`server/`, Express + TypeScript) with a React SPA (`dashboard/`, Vite + React + TypeScript + Tailwind). The dashboard reads `~/.claude/projects/` JSONL transcripts, streams live SDK events over WebSocket/SSE, and renders a terminal-dense multi-pane workspace for inspecting agents as they run.

Key surfaces:

- **Titlebar** — product name, current repo/branch, theme toggle (light/dark/high-contrast).
- **Sidebar (`RepoList`)** — connection status, usage bars (5h session / 7d rate limit), collapsible repo tree with expandable session lists.
- **TopBar / HUD** — live/done status dot, permission-mode pill, model + controls zone, age, context %, cost, agents, tokens-in/tokens-out.
- **Turn History Panel** — collapsible rail of turn cards with pulsing status dots.
- **Conversation view** — `TurnCard` rows with User (U) + Claude (C) avatars, agent pills, thinking/narration/tool-entry blocks, cost footer.
- **Bottom Panel** — tabbed dock: `Trace` (Gantt), `Detail`, `Tasks`, `Cost`, `AgentLog`.
- **Side panels** — SettingsPanel, McpManager, PermissionHistory, HookEditor, MemoryEditor, StatsPanel, DoctorPanel, TaskMonitor.

## Sources

- **Repo:** https://github.com/lukehungngo/claude-devtools (branch `master`, commit `c594e88`)
- **Key files read:**
  - `README.md`, `CLAUDE.md`, `package.json`
  - `dashboard/index.html` (font imports, `data-theme="light"` default)
  - `dashboard/tailwind.config.js` (`dt-*` tokens, tight 6–15px font scale)
  - `dashboard/src/styles/globals.css` (all CSS vars, three themes, `.dt-*` component classes, trace/rawlog CSS)
  - `dashboard/src/components/Layout.tsx`, `Titlebar.tsx`, `TopBar.tsx`, `RepoList.tsx`
  - `dashboard/src/components/conversation/TurnCard.tsx`
  - `dashboard/src/routes/AppLayout.tsx`

## Index

- `README.md` — this file.
- `colors_and_type.css` — every CSS var, three themes, semantic type classes (`.t-h1`, `.t-mono`, `.t-metric`, …).
- `preview/` — one HTML card per design-system concept; surfaces in the Design System tab.
- `ui_kits/dashboard/` — React recreation of the dashboard: sidebar, titlebar, topbar, turn card, bottom panel.
- `assets/` — logo placeholder; brand SVG marks.
- `SKILL.md` — agent-facing skill entry point.

---

## CONTENT FUNDAMENTALS

The voice is **terse, engineer-facing, mechanical**. It reads like a terminal prompt, not a marketing site.

- **Casing.** Labels are `Title Case` (one or two words), eyebrows are `UPPERCASE` with letter-spacing (`.4–.8px`). Status words are `SHOUTED`: `LIVE`, `DONE`, `WAIT`.
- **Voice.** Third-person neutral. No "I", rarely "you". Example from `RepoList`: "No sessions found", "MCP + logs + hooks", "resets in 2h 14m". Never "Let me…" or "We'll…".
- **Density.** Everything is abbreviated to fit the HUD: `In`, `Out`, `Age`, `Cost`, `Agents`, `Context`. Token counts are compressed (`4.2k`, `1.3M`), durations are ISO-ish (`4m 12s`), costs are `$0.042`. Four-letter status pills (`WAIT`, `LIVE`, `DONE`, `YOLO`).
- **Permission modes.** Literal enum strings, Title Case: `Default`, `Accept Edits`, `Plan`, `Auto`, `Don't Ask`, `YOLO` (the one playful label — and it's still shouted).
- **Placeholders.** Quiet, informational: `"Select a session from the sidebar"`, `"Loading..."`.
- **Errors.** Stated plainly: `"Session ended without completion"`, `"Failed to resume session"`. No apologies.
- **Emoji.** None. Ever. The app does use a handful of Unicode symbols (`▸`, `✓`, `·`, `—`) as structural glyphs, and `lucide-react` icons everywhere else.
- **Vibe.** Pragmatic. Sits between a Chrome DevTools panel and a well-styled terminal. Warmer than most — the warm-paper palette intentionally softens what would otherwise be an all-grey observability dashboard.

---

## VISUAL FOUNDATIONS

### Palette philosophy
The system is explicitly "Claude Desktop inspired" — a **warm cream paper** base (`#F7F5F0`), not clinical white. The accent is **terracotta** (`#C2592E` light, `#D97757` dark), borrowed from Anthropic brand. Semantic colors (green, amber, red, teal, purple) are all **muted / dusty** — never saturated. Dimmed backgrounds for each semantic color sit at ~8% alpha in light, ~12% in dark. Three themes ship: `light` (default), `dark` (warm charcoal), `high-contrast` (pure black + brighter tokens).

### Type
Two families. `DM Sans` (300/400/500/600) for UI prose. `JetBrains Mono` (400/500) for everything data — IDs, tokens, durations, tick labels, cost figures. Base size is an unusually tight `13px`; the full scale bottoms out at `6px` (`3xs`) for axis ticks and tops out at `15px` (`2xl`) for card titles. H1 is 22px (`.dt-title`). Letter-spacing pops up on eyebrows (`.4px` / `.8px` uppercase) and status pills.

### Spacing
Tailwind default + a custom micro-scale: `0.75` = 2px, `1.25` = 4px, `1.75` = 6px, `3.75` = 14px, `4.5` = 18px, `7.5` = 28px. Topbar is exactly `40px` tall. Titlebar is `38px`. Sidebar is `220px` (`240px` on ≥1920, `200px` on ≤1279).

### Backgrounds
Flat. No gradients, no images, no textures. Surfaces stack purely via the `--bg → --bg-s → --bg-e → --bg-h` token ramp. Blur is reserved for the `.dt-glass` utility (`backdropBlur: 16px`) on floating overlays — used sparingly.

### Animation
Everything eases on `cubic-bezier(0.16, 1, 0.3, 1)` — the "expo-out" curve. Three durations: `120ms` (fast / hover), `200ms` (normal / fade & slide), `350ms` (slow / layout shifts like sidebar collapse). Named keyframes: `fadeIn` (4px up), `slideUp` (8px up), `slideDown`, `pulse-opacity`, `pulse` (scale 1→.7 for live dots), `dash-offset` (DAG edges), `shimmer` (skeletons). **`prefers-reduced-motion` squashes all anims to 0.01ms.**

### Hover & press
- Hover: surface shifts one step up the bg ramp (`--bg-s` → `--bg-h`). Opacity drops to `.8` on text-only buttons.
- Press: same surface, occasionally a `-translate-y-px` lift on `.dt-card-hover`.
- Focus: `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--acc)` — a double-ring that reads in both themes.

### Borders
Always `1px solid var(--bd)`. Active/strong uses `--bd-s`. Subtle borders use `rgba(0,0,0,.04)`. The HUD flashes a `2px solid var(--red)` outline when context ≥80%.

### Shadows
Four tiers: `--shadow-sm` (1px subtle), `--shadow-md` (4px 12px), `--shadow-lg` (8px 24px), `--shadow-glow` (terracotta ambient). Dark theme suppresses `--shadow-sm` entirely (shadows disappear on dark surfaces).

### Corner radii
`3px` (tiny — inline code), `5px` (small — trace bars, icons), `8px` (default — buttons, panels), `10px` (`dt-md` — cards), `12px` (`dt-lg` — modals), `16px` (`dt-xl` — rare). Pills use `rounded-xl` and above.

### Cards
`bg-dt-bg2` + `1px solid var(--bd)` + `shadow-dt-sm` + `dt-md` or `dt-lg` radius. On hover: `bg-dt-bg3`, `shadow-dt-md`, `border-dt-border-active`, `-translate-y-px`. No drop shadows in dark.

### Transparency
Used deliberately: permission-mode pills use `color-mix(in srgb, var(--amb) 15%, transparent)` for the fill. Dimmed semantic backgrounds (`--acc-bg`, `--grn-bg`, etc.) are all ~8–18% alpha. Everything else is opaque.

### Layout rules
Fixed titlebar (38px) + topbar (40px). Sidebar + turn-history rails are collapsible and persist state in `localStorage`. Bottom panel is dockable, lazy-loaded. Main area is `flex-1 min-w-0` — always scrollable.

### Imagery
There is **no photography** in this product. The visual identity is carried entirely by palette, type, the terracotta accent, and a very restrained Lucide icon set.

---

## ICONOGRAPHY

- **Icon library:** `lucide-react` — stroke-based, 2px weight, rounded corners. Used at `9–14px` in buttons and lists; `12–16px` inline with labels. Imported per-component: `import { X, Plus, Play, Settings, Copy, Check, Sun, Moon } from "lucide-react"`.
- **Unicode glyphs** as structural chrome: `▸` (repo collapse chevron), `◀` (sidebar toggle), `✓` (completion check), `·` (separator dot).
- **Status dots:** 5–7px `border-radius: 50%` divs filled with `--grn`/`--amb`/`--red`/`--t3`. `animation: pulse 2s infinite` when live.
- **Traffic-light dots:** `--dots-r/y/g` tokens exist for macOS-window-chrome decorations (not seen in main views but reserved).
- **Custom SVG:** only for the DAG edges (dashed stroke, animated `dash-offset`) and the progress-bar fills. No hand-drawn illustrations. **No emoji ever.**
- **Logos:** we use a simple terracotta `C*` wordmark in `assets/` as a placeholder — the repo ships no logo SVG. **Flag to user:** supply a real logo if one exists.

### Font substitution flag

Both families (`DM Sans`, `JetBrains Mono`) are pulled from Google Fonts — the same source the production app uses, so **no local TTF files are needed and nothing is substituted**.

---

## UI kits

- `ui_kits/dashboard/` — the full dashboard chrome reassembled from React components: `Titlebar`, `Sidebar`, `TopBar`, `TurnHistoryPanel`, `TurnCard`, `BottomPanel` tabs. See its README.
