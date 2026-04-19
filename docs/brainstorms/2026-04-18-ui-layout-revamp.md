# Brainstorm: UI Layout Revamp — Header + Sidebar Restructure

**Date:** 2026-04-18
**Input type:** Criteria (current vs. target screenshots + constraint)
**Input:** Gap analysis between current dashboard (Image #4) and target design (Image #5). Zero functionality changes — UI revamp only.

---

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| `isConnected` (boolean) is available from WS hook | CONFIRMED | `useUnifiedWebSocket` returns `isConnected` |
| WS latency (ms) is NOT currently measured | CONFIRMED | `useUnifiedWebSocket` has no pong/RTT logic; server pings every 30s but client ignores |
| Usage data (fiveHour + sevenDay utilization) is available at AppLayout | CONFIRMED | `useUsage()` in AppLayout, currently forwarded to RepoList |
| `contextWindowSize` is in `SessionMetrics` | CONFIRMED | `dashboard/src/lib/types.ts:241` |
| `permissionMode` ("default" / "yolo" / etc.) is in TopBar | CONFIRMED | Passed as prop from AppLayout |
| Turn history toggle (`toggleTurnHistory`) exists in AppLayout | CONFIRMED | `setTurnHistoryOpen` callback already wired |

---

## Fundamentals

### What the current layout is

```
Titlebar: [Claude DevTools brand] [center: repo@branch text] [theme toggle] [avatar]
Sidebar:  [CONNECTION section — Claude Code + plan] [USAGE section — 2 progress bars] [REPOSITORIES — expanded repos]
TopBar:   [repo@branch crumb] [LIVE badge] [mode badge: "Default"] [Model] [Age] [Context: 36% + bar] [Cost] [Agents] [IN] [OUT]
```

### What the target layout is

```
Titlebar: [Claude DevTools brand] [● Connected 47ms] [center: usage meters "5h ▬ 7% ▶ 4h 11m"] [moon icon] [avatar]
Sidebar:  [REPOS header with + and ⊞ buttons] [repo tree with nested sessions]
TopBar:   [repo@branch crumb with ✎ edit icon] [LIVE badge] [mode badge: "YOLO" styled] [Model] [Age] [Context: 67% ▬▬ of 250K] [Cost] [Agents] [IN] [OUT]
```

### The structural insight

The CONNECTION + USAGE sections move from sidebar → titlebar. The sidebar becomes a pure navigator. This is a space trade: sidebar gains vertical real estate for more sessions, titlebar gets persistent system status always visible.

---

## Output: Gap Evaluation

### GAP 1 — Titlebar: connection status pill with latency
- **Current**: Nothing
- **Target**: `● Connected 47ms` — green dot + "Connected" label + RTT in ms
- **Data gap**: `isConnected` boolean exists; latency (ms) does NOT exist. Need pong-based RTT in `useUnifiedWebSocket`:
  - On WS open: start recording `pingTime = Date.now()` on each ping sent
  - On `pong` event: `latency = Date.now() - pingTime`
  - Expose `wsLatency: number | null` from hook
- **Files**: `useUnifiedWebSocket.ts`, `Titlebar.tsx`, `AppLayout.tsx` (pass latency prop)
- **Priority**: P1 — visible in titlebar at all times

### GAP 2 — Titlebar: usage meters (replace center repo@branch)
- **Current**: Center shows `repo@branch` text (redundant — already in TopBar HUD crumb)
- **Target**: `5h ▬ 7% ▶ 4h 11m` — inline session + rate limit with bar and time-remaining
- **Data gap**: None — `usage.fiveHour.utilization`, `usage.sevenDay.utilization`, `usage.fiveHour.resetsAt` already in AppLayout
- **Files**: `Titlebar.tsx` (add usage props), `AppLayout.tsx` (pass usage to Titlebar)
- **Priority**: P1 — replaces the center area

### GAP 3 — Sidebar: remove CONNECTION + USAGE sections
- **Current**: `RepoList.tsx` renders CONNECTION (Claude Code status + plan row) and USAGE (2 progress bars with reset times)
- **Target**: Those sections gone from sidebar (content moved to titlebar in GAP 1 + GAP 2)
- **Files**: `RepoList.tsx` — delete CONNECTION section (~lines 89–138) and USAGE section (~lines 140–156)
- **Priority**: P0 — must land same task as GAP 1 + GAP 2 to avoid showing data in two places
- **Risk**: `isConnected` and `usage` props on RepoList still needed by Titlebar — don't remove the props from AppLayout

### GAP 4 — Sidebar: "REPOS" header with + and ⊞ buttons
- **Current**: Repos section starts directly with repo items, no prominent header or action buttons
- **Target**: `REPOS` label + `+` button (start session) + `⊞` button (toggle turn history panel)
- **Data gap**: None — `onNewSession` already on RepoList; `toggleTurnHistory` exists in AppLayout (not passed to RepoList yet)
- **Files**: `RepoList.tsx` (add header), `AppLayout.tsx` (pass `onToggleTurnHistory` prop to RepoList)
- **Priority**: P2 — cosmetic header, but ⊞ button requires new prop wire

### GAP 5 — TopBar HUD crumb: branch edit ✎ icon
- **Current**: `claude-devtools @ master` plain text
- **Target**: `claude-devtools @ ✎ master` — ✎ pencil glyph (decorative, no edit action needed)
- **Files**: `TopBar.tsx` — add `<Pencil size={11} />` from lucide-react before branch name
- **Priority**: P3 — cosmetic only

### GAP 6 — TopBar HUD: context display "67% ▬▬ of 250K"
- **Current**: `{contextPct}%` + 42px bar
- **Target**: `67%` + bar + `of 250K` suffix using `contextWindowSize` from metrics
- **Files**: `TopBar.tsx` — add `of {formatK(metrics.contextWindowSize)}` after the bar
- **Priority**: P2 — useful info, low risk

### GAP 7 — TopBar: permission mode badge styling
- **Current**: "Default" / "YOLO" rendered as plain text badge with same style
- **Target**: "YOLO" badge has distinct accent color (visible difference in Image #5 shows terracotta badge)
- **Files**: `TopBar.tsx` — conditional style: `permissionMode === "yolo"` → `acc` background
- **Priority**: P3 — cosmetic

---

## Scope & Constraints

- **Zero behavior changes** — all gaps are CSS, layout restructuring, moving data between components
- **No new hooks needed except WS latency** (GAP 1 is the only logic addition)
- **Data flow**: `usage` and `wsLatency` move from sidebar props → titlebar props. AppLayout passes both to both during transition, then removes from RepoList after GAP 3 lands.

## Scoped Out
- "✎" branch editing functionality — decorative icon only
- "+" in REPOS header creating a repo picker — just starts session in current repo
- YOLO badge click behavior

---

## Task Map (for plan)

| Task | Gap | Files | Priority |
|------|-----|-------|----------|
| T1 | WS latency measurement | `useUnifiedWebSocket.ts` | P1 |
| T2 | Titlebar connection pill + usage meters | `Titlebar.tsx`, `AppLayout.tsx` | P1 |
| T3 | Remove CONNECTION + USAGE from sidebar | `RepoList.tsx` | P0 (paired with T2) |
| T4 | REPOS header + ⊞ toggle | `RepoList.tsx`, `AppLayout.tsx` | P2 |
| T5 | Context "of Nk" suffix + branch ✎ icon + YOLO badge | `TopBar.tsx` | P2–P3 |

T1→T2→T3 must land together (otherwise data shows in two places or nowhere).
T4 and T5 are independent — can land separately.

## Next Steps

```
Suggested next step:
  /mas:dev-loop --auto implement UI layout revamp — see docs/brainstorms/2026-04-18-ui-layout-revamp.md

Alternatives (your choice):
  /mas:dev-loop implement layout revamp (interactive mode)
  Or continue refining the gap list.
```
