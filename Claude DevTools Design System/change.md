A written walkthrough of every region currently on screen, top → bottom, outside → in. Functionality stays unchanged; this is the document you'd hand a designer tasked with re-skinning the whole thing.

1. Titlebar (global chrome, full-width strip)
A thin horizontal bar pinned to the very top. Left-to-right:

Brand — "Claude DevTools" in the accent color (two lines, tight).
Separator (1px hairline).
Connection pill — ● green dot + "Connected" + latency (e.g. 47ms). Pulsing dot. Click → opens profile drawer.
Usage pill — two compact meters side by side:
5h label · mini bar · 7% · ↻ 4h 11m
separator
7d label · mini bar · 29% (amber) · ↻ 6d 8h Click anywhere → opens profile drawer to Usage.
Spacer (fills remaining width).
Theme toggle — sun/moon icon.
Avatar button — initials "SH" in a rounded square. Click → profile drawer.
All pills share: small padding, --r radius, hover = faint background, 10–11px mono inner text.

2. Body (everything below titlebar; horizontal split)
Four vertical regions left-to-right: Sidebar → Ribbon → Main → (Drawer overlay).

2a. Sidebar — "Repos" panel (leftmost)
Fixed width when open, collapses to a 32px rail.

Header row (click to toggle collapse):
Panel-toggle icon (panel-with-arrow-in when expanded / panel-with-arrow-out when collapsed)
"REPOS" section label (10px uppercase mono)
+ button on the right (new repo)
Repo rows (3 of them):
Row head is clickable to expand/collapse that repo's sessions.
Chevron (▾ open / ▸ collapsed)
Two stacked labels: folder name (12px sans, --t1) on top, git origin (10px mono, muted, with mini GitHub glyph) below. Example: claude-devtools / lukehungngo/claude-devtool.
Session rows under each repo (when expanded):
Status dot (run = pulsing orange, pass = green, idle = gray)
Title (11px) + meta sub-row: T26 · cost $2.59
Active session has a left accent bar and tinted background.
2b. Ribbon — "Turns" panel (next column)
Same collapse pattern as sidebar, starts collapsed by default.

Header row (click to toggle):
Panel-toggle icon
"TURNS" label
Right-aligned mono counter 26 · 3h 12m
Turn cards (scrollable list when open):
Top row: status dot, turn ID (T26), one-line title.
Meta row: agent pills (e.g. pm, swe, bug), spacer, cost, duration.
Token row (wraps below): in 8.4K (teal) · out 62K (purple).
Active turn has accent border/tint.
2c. Main (the big right column — fills remaining width)
Stacked vertically: HUD → Conversation → View tabs / dock → Agent graph panel.

2c.i. HUD (top strip of main, one row)
Single-row summary bar. All tile labels (tiny uppercase .e) align on one horizontal line; all values (.v) sit directly below them. Left-to-right:

Crumb — claude-devtools @ ⎇ master (repo bold, "@" muted, branch in accent with Git-branch glyph). Hairline separator right.
Status — ● LIVE (green dot + 10px bold label). Separator.
Permission mode — YOLO pill (red-bg, red text).
Tiles (label-above-value pattern; separators between each):
Model — "Sonnet 4.6" (11px mono)
Age — "2h 59m" (11px mono)
Context — 67% (amber) + 48px mini-bar + of 250K muted — all inline on one row so the label stays level with siblings
Cost — $76.62 (amber)
Agents — 14
Right cluster (margin-auto'd):
In — 79K (teal)
Out — 665K (purple)
2c.ii. Conversation (the scrollable center)
Top-to-bottom chat-style transcript:

Timestamp divider — "You · 3h ago" (tiny, right-aligned).
User bubble — orange-tinted pill on the right with user's prompt.
Claude response — avatar C (circle) + response body:
Header: Claude · sonnet-4-6
Main chip: ▸ Main · x30 $2.59 In/Out 36/12K (collapsible summary).
Working row: WORKING 4 steps · 481 chars.
Tool-call row: ▸ 19 tool calls + breakdown chips on the right (BASH 9, GREP 1, READ 4, WRITE 1).
Thinking & Reply disclosures (details/summary), each with:
Label (Thinking · 12s or Reply) + a peek line of text.
Expanded body contains structured markdown: code-styled inline text, bullet lists, bold headings like "Plan: Fix Subagent 'Running' After Session Ended", inline code chips for symbols (deriveStatus()), paths in monospace.
Context summary: $2.59 · 1 agent · In: 36 / Out: 12K.
Done line: ✓ Completed in 3m 4s · sonnet-4-6.
Composer: single-line input "yes, continue with the backend guard…" + orange Send button.
2c.iii. View tabs (dock header, just under composer)
Tab strip + dock toggle on the right:

Tabs: Agent Graph (active), Tool Call, Cost, Tasks.
Right: "Scoped to T26" + dock collapse button.
2c.iv. Dock panel (bottom section; flips between the four tabs)
Currently shows Agent Graph:

Timeline header — "AGENT / NAME / MODEL / DURATION / COST" columns on the left, then time-axis ticks 0m 2m 4m 6m 8m 10m 12m 14m.
Rows — one per agent:
Badge (colored initials, e.g. MA, EN, QA, RV)
Agent name + truncated description
Slash-handle (main, mas:en…)
Model (muted mono)
Duration
Cost (amber)
A horizontal bar drawn on the timeline showing when the agent was active.
Other tabs (Tool Call / Cost / Tasks) swap the body but keep the same column header shape.
Other log panes exist in the source (rawlog, structured tool-call log) and are rendered in the same column but only visible when those tabs are selected.

3. Profile drawer (right-side overlay)
Slides in from the right, dims the rest of the page with a backdrop. Opens from titlebar connection pill / usage pill / avatar button.

Header — avatar circle + name ("Soh Patrick") + email + close ✕.
Body sections, each prefixed with a small stitle:
Connection — 2-up tile grid:
Claude Code tile: connected value + mini heartbeat trace.
API tile: 47 ms latency + heartbeat trace.
Plan card — gradient background, MAX badge, "Max plan · 5× usage", model list sonnet-4-6 · opus-4 · haiku-4-5.
Usage — two ring-dial cards stacked:
Session limit — 72×72 green ring, 7% used, "5h rolling window", "↻ resets in 4h 11m".
Weekly limit — 72×72 amber ring, 29% used, "7d rolling window", "↻ resets in 6d 8h".
Footer — two buttons: Preferences · Sign out (destructive red).
4. Shared system tokens (what re-skinning means)
Colors: --bg, --bg-s, --bg-e, --bg-h (surfaces); --t1..t4 (text ramp); semantic --grn, --amb, --red, accent --acc, --teal, --pur with -bg tinted variants; agent-span colors --span-pm, --span-swe, --span-qa, --span-bug, --span-doc, --span-rev (each has matching text color -t).
Type: --font-sans for UI, --font-mono for anything numeric or code-like. Sizes range 8px (uppercase labels) → 15px (dial centers). Weights 500/600/700.
Geometry: --r (pill / card), --r-sm (rows). Borders are almost always a single --bd hairline. Shadows are absent — depth comes from layered backgrounds (bg-s > bg > bg-e).
States: pulsing dots (session running), amber for warning, accent for active selection, hover = one step brighter surface.
Motion: 0.12–0.18s ease transitions for collapse/hover, a couple of pulse keyframes (tb-pulse, heart-pulse