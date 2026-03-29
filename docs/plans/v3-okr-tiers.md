# V3 OKR, Metrics & Task Breakdown by Tier

**Author:** Luke + Claude
**Date:** 2026-03-29
**Status:** Active — Post-audit restructure
**Source:** `docs/reports/combined-audit-2026-03-29.md`

---

## Objective

**Make claude-devtools a full Claude Code web client that replaces the terminal CLI and adds observability the CLI cannot provide.**

### Honest Parity Assessment (Post-Audit)

| Metric | Value |
|--------|-------|
| Working features | 28 |
| Partial features | 14 |
| Broken features | 3 |
| Missing features | 20+ |
| **Core CLI parity** | **~39% (working only)** |
| **With partial** | **~58%** |
| **With observability bonus** | **~64%** |
| Tests | 735 (0 failures) |
| Architecture invariants | 7/7 |

Previous claim of 75% was inflated — partial/broken features counted as complete.

---

## Tier 1: "Can Replace CLI" — COMPLETE (PR #7)

### OKR

**Objective:** A developer can use the web client as their primary Claude Code interface for a full coding session.

| Key Result | Metric | Target | Actual |
|------------|--------|--------|--------|
| KR1: All P1 interactive features work | 9 P1 features | 9/9 | **9/9** |
| KR2: Slash commands affect session state | Commands trigger SDK ops | /clear, /compact, /model | **Done** |
| KR3: End-to-end workflow test | Build → test → commit without terminal | Pass | **Partial (SSE gap blocks)** |
| KR4: No silent session failures | Errors visible and recoverable | 0 silent failures | **FAIL (3 broken)** |

### Success Metrics

- [x] Tool results visible for Read, Write, Edit, Bash, Glob, Grep tools (T1-01, PR #7)
- [x] Code blocks render with language-specific syntax highlighting (T1-02, PR #7)
- [x] `/clear` resets conversation context (T1-03, PR #7)
- [x] `/compact` triggers context compaction with optional focus instructions (T1-04, PR #7) — **PARTIAL: sent as text, not SDK API**
- [x] `/model` changes the model for subsequent messages (T1-05, PR #7)
- [x] Permission mode changeable mid-session (T1-06, PR #7)
- [x] "Allow for session" works end-to-end (T1-07, PR #7)
- [x] Context > 90% triggers warning (T1-08, PR #7) — **PARTIAL: manual button, not truly automatic**
- [x] `@` file path autocomplete from session cwd (T1-09, PR #7)

---

## Tier 2: "Better Than CLI" — COMPLETE (PR #8)

### OKR

**Objective:** The web client provides capabilities the terminal CLI cannot.

| Key Result | Metric | Target | Actual |
|------------|--------|--------|--------|
| KR1: Observability features | Unique features not in CLI | 10+ | **11** |
| KR2: Diff/change visualization | Users can see file changes per turn | Implemented | **Done** |
| KR3: Session analytics | Cost/time/tool patterns | Implemented | **Done** |
| KR4: Advanced slash commands | P2 commands working | 8+ | **13** |

### Success Metrics

- [x] File diffs visible per turn (T2-01, PR #8)
- [x] `/cost` shows detailed per-model breakdown (T2-02, PR #8)
- [x] Context visualization (T2-03, PR #8)
- [x] Permission rules viewable (T2-04, PR #8)
- [x] Git diffs viewable from web UI (T2-05, PR #8) — **PARTIAL: --stat only**
- [x] Prompt history navigable with Up/Down (T2-07, PR #8)
- [x] 8+ P2 slash commands functional (T2-08, PR #8)
- [x] Session analytics dashboard (T2-18, PR #8)
- [x] SSE errors surfaced to user (T2-19, PR #8)

---

## Tier 3: "Power User Features" — COMPLETE (PR #9)

### OKR

**Objective:** Feature coverage >= 90% of applicable CLI features.

| Key Result | Metric | Target | Actual |
|------------|--------|--------|--------|
| KR1: Feature coverage | % of applicable CLI features | >= 90% | **~58% (FAIL)** |
| KR2: Configuration parity | Settings/themes/hooks/MCP from web | 4/4 | **4/4 read-only, 0/4 editable** |
| KR3: Keyboard parity | CLI shortcuts with web equivalents | >= 80% | **8/13 = 62%** |
| KR4: Collaboration features | Multi-user session viewing | 1+ | **Deferred** |

### Success Metrics

- [ ] Settings editable from web — **READ-ONLY** (SettingsPanel shows, cannot edit)
- [x] Light mode and high-contrast themes available (T3-02, PR #9)
- [ ] MCP servers manageable from web UI — **READ-ONLY** (McpManager views only)
- [ ] Hooks editable — **READ-ONLY** (HookEditor views only)
- [x] >= 10 keyboard shortcuts functional (8 working)
- [x] Prompt suggestions appear based on context (T3-12, PR #9) — **PARTIAL: static only**
- [x] Conversation exportable as markdown (T3-08, PR #9)
- [ ] Feature coverage >= 90% — **FAIL: ~58%**

---

## NEW: Tier 0: "Fix Broken" — IMMEDIATE PRIORITY

### OKR

**Objective:** Zero silent failures. Features that exist must actually work end-to-end.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: SSE forwards all event types | tool_use, tool_result, thinking visible in real-time | 100% of SDK event types forwarded |
| KR2: Zero silent data drops | No feature captures data client-side that server drops | 0 silent drops |
| KR3: All stored flags are used | Every session flag passed to SDK query() | 100% coverage |

### Tasks

| ID | Task | Severity | Effort |
|----|------|----------|--------|
| T0-01 | **SSE: Forward tool_use/tool_result/thinking events** | P0 | 4-6h |
| T0-02 | **SSE: Client renders tool/thinking events inline during streaming** | P0 | 4h |
| T0-03 | **Image paste: Read images from body, pass to SDK** | P1 | 1h |
| T0-04 | **fastMode: Wire to query() options** | P1 | 30min |
| T0-05 | **/diff: Full content not --stat** | P1 | 1h |

**Total estimated: ~11h**

### Success Metrics

- [ ] During active session, user sees tool calls appearing in real-time (not just text)
- [ ] Pasted images reach Claude (visible in response)
- [ ] `/fast on` affects query speed
- [ ] `/diff` shows full unified diff content

---

## NEW: Tier 4: "Interactive Coding Core" — NEXT PRIORITY

### OKR

**Objective:** A developer can do a full coding session without opening the terminal. Interactive experience matches CLI responsiveness.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: All interactive features work | ! bash, real compact, task panel | 100% |
| KR2: Configuration editable | Settings, hooks, memory, MCP | 4/4 editable |
| KR3: Tool permission rules | Allow/deny per-tool from UI | Implemented |

### Tasks

| ID | Task | Effort | Depends On |
|----|------|--------|------------|
| T4-01 | **! bash mode** — Detect `!` prefix, execute shell command | 2h | — |
| T4-02 | **/compact: Real SDK API call** with progress feedback | 3h | — |
| T4-03 | **Interactive task panel** — Real-time task list UI | 3h | — |
| T4-04 | **Auto-compact at context limit** — Automatic, not manual button | 2h | T4-02 |
| T4-05 | **Settings editable** — Write endpoints for model/mode/effort/fast | 4h | — |
| T4-06 | **CLAUDE.md editable** — Write endpoint + editor UI | 3h | — |
| T4-07 | **Hooks editable** — Write to settings.json | 3h | — |
| T4-08 | **Tool allow/deny rules** — Permission configuration UI | 4h | — |
| T4-09 | **MCP server add/remove** — Write to settings.json | 3h | — |
| T4-10 | **/rewind via dedicated API** — Not text passthrough | 3h | — |

**Total estimated: ~30h**

### Success Metrics

- [ ] `!ls` in prompt executes shell command and shows output
- [ ] `/compact` shows before/after context %
- [ ] Task panel shows real-time task list from SDK events
- [ ] All config panels are read-write (not just read-only)
- [ ] Tool allow/deny rules configurable from web UI

---

## NEW: Tier 5: "Full Parity" — FINAL

### OKR

**Objective:** >= 90% CLI feature coverage. No reason to use terminal.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: Feature coverage | % of applicable CLI features | >= 90% |
| KR2: All commands implemented | Missing CLI commands added | 100% of stable commands |
| KR3: Keyboard parity | All shortcuts mapped | >= 90% |

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T5-01 | /resume as slash command with session picker | 1h |
| T5-02 | /add-dir multi-directory support | 2h |
| T5-03 | Remaining keyboard shortcuts (Alt+P, Alt+T, Alt+O, Ctrl+B, Ctrl+T) | 3h |
| T5-04 | /login + /logout auth management | 2h |
| T5-05 | Session naming server-side persistence | 2h |
| T5-06 | Background task management (Ctrl+B) | 4h |
| T5-07 | /review PR integration | 4h |
| T5-08 | /agents management | 3h |
| T5-09 | /batch parallel changes | 3h |
| T5-10 | Transcript search (not just turn search) | 2h |

**Total estimated: ~26h**

---

## Summary

| Tier | Objective | Tasks | Status | Parity Impact |
|------|-----------|-------|--------|---------------|
| **Tier 0** | Fix Broken | 5 | **NOT STARTED** | 39% → ~47% |
| **Tier 1** | Can Replace CLI | 9 | COMPLETE (PR #7) | — |
| **Tier 2** | Better Than CLI | 19 | COMPLETE (PR #8) | — |
| **Tier 3** | Power User Features | 16 | COMPLETE (PR #9) | — |
| **Tier 4** | Interactive Coding Core | 10 | **NOT STARTED** | 47% → ~72% |
| **Tier 5** | Full Parity | 10 | **NOT STARTED** | 72% → ~90%+ |

### Priority Order

```
Tier 0 (fix broken — IMMEDIATE) → Tier 4 (interactive core) → Tier 5 (full parity)
```

Tiers 1-3 are done but incomplete due to broken/partial features identified in audit. Tier 0 fixes the foundation. Tier 4 completes the interactive experience. Tier 5 closes the remaining gap.
