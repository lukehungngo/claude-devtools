# Session Loop State

**Updated 2026-05-16, end of planning pass.**

This is the canonical view. Read this when picking up after the other agent merges.

---

## Loop methodology

Each phase runs 5 steps in order:
1. **Spec** — written from verified data + bug docs
2. **Spec review** — adversarial pass by `mas:differential-reviewer`, applies REVISE concerns
3. **Implementation plan** — TDD-ordered tasks
4. **Execute** — code changes, test runs (currently **blocked**: other agent on repo)
5. **Gap review** — verify, loop back to Step 1 if gaps remain

---

## Status by phase

| Phase | Title | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 |
|---|---|---|---|---|---|---|
| 1 | Task derivation fix | ✅ | ✅ REVISE applied | ✅ | ⏸️ blocked | ⏸️ |
| 2 | Design-system hygiene | ✅ | ✅ REVISE applied | ✅ | ⏸️ blocked | ⏸️ |
| 3 | Subagent tool_result join | ✅ | ✅ REVISE applied | ✅ | ⏸️ blocked | ⏸️ |
| 4 | Visual rebuild | ✅ | ✅ REVISE applied | ✅ | ⏸️ blocked | ⏸️ |
| 5 | Active Only auto-refresh | ✅ | ✅ self-review | ✅ inline | ⏸️ blocked | ⏸️ |

**Block reason:** another agent is active on this repo per session note. Phases 1-5 must rebase / coordinate before Step 4 execute.

---

## Docs index

### Specs (`docs/specs/`)
- `phase-1-task-derivation.md`
- `phase-2-design-hygiene.md`
- `phase-3-subagent-join.md`
- `phase-4-visual-rebuild.md`
- `phase-5-active-only-refresh.md`

### Implementation plans (`docs/plans/`)
- `phase-1-impl-plan.md` (T1-T6)
- `phase-2-impl-plan.md` (T1-T11)
- `phase-3-impl-plan.md` (T1-T13)
- `phase-4-impl-plan.md` (T1-T13)
- Phase 5 plan inline in spec

### Bug docs (verified post-pass)
- `docs/bugs/task-derivation-gaps.md` — verified findings, 5 false claims recanted
- `docs/bugs/subagent-execution-missed.md` — verified fix path via tool_result join
- `docs/bugs/tasks-not-scoped-to-turn.md` — verified
- `docs/bugs/task-derivation-gaps.md` cross-links the recants

### Design + audit
- `docs/design/anthropic-handoff/dashboard.html` — source design (2268 lines)
- `docs/design/anthropic-handoff/colors_and_type.css` — design tokens
- `docs/design/ui-ux-validation-report.md` — 5 hygiene gaps (Phase 2 source)

### Other
- `docs/plans/SESSION-SYNTHESIS.md` — pre-Phase-spec synthesis (now supplanted by this file)
- `docs/plans/ux-backlog.md` — Phase 5 source + pending Tailwind class migration follow-up

---

## Verified ground truth (do not re-litigate)

From the JSONL scan of 21 sessions, 199,301 events:

- **TaskCreate** = real tool. Input: `{ subject, description, activeForm? }`. 61 calls.
- **TaskUpdate** = real tool. Input: `{ taskId, status?, addBlockedBy?, description? }`. 110 calls.
- **TaskList** = real tool, idempotent no-op. 3 calls.
- **Agent** = subagent dispatch tool. 478 calls. Input: `{ description, prompt, subagent_type, … }`.
- **TodoWrite** = 0 calls. Not used in this Claude Code variant.
- **Sidechain events** = 0/199k. Subagents do not emit own events.
- **Sequential `TaskUpdate.taskId`** = verified 110/110.
- **`addBlockedBy` events** = 5, all without `status` (real scenario).
- **Status values** = `"in_progress"`, `"completed"` only.
- **`Agent` tool_use ↔ `tool_result`** = 22/22 matched by `tool_use_id` in screenshot session.

---

## Recanted claims (cleaned up in docs)

- ~~Subagent TodoWrite contaminates main via `isSidechain` filter~~ (false: 0 sidechain events)
- ~~Partial/streaming `tool_use` shrinks list~~ (false: SSE ships full assistant message at content_block_stop)
- ~~`t.id` is the stable ID we should read~~ (false: no `id` field; subject + sequential taskId)
- ~~TaskCreate/TaskUpdate are dead branches~~ (false: 56+107 real calls)
- ~~normalizeStatus catch-all causes drift~~ (not observed: only "in_progress" + "completed")

---

## Resumption checklist (when other agent merges)

1. `git pull` the latest master.
2. `git status` on `dashboard/src/lib/sessionTasks.ts`, `dashboard/src/lib/turnSnapshot.ts`, `dashboard/src/lib/agentStatus.ts`, `dashboard/src/styles/globals.css`, `dashboard/tailwind.config.js`, `dashboard/src/components/insights/CASRow.tsx`, `dashboard/src/components/bottom-panel/TraceTab.tsx`, `dashboard/src/components/bottom-panel/BottomPanel.tsx`, `dashboard/src/components/conversation/ConversationView.tsx`. Verify no unrelated WIP.
3. Pick recommended ship order:
   1. **Phase 1** (Task derivation) — biggest user-visible impact, smallest blast radius
   2. **Phase 2** (Design hygiene) — independent files, parallelizable
   3. **Phase 5** (Active Only refresh) — micro-change, freebie
   4. **Phase 3** (Subagent join) — after Phase 1 settles; touches similar areas
   5. **Phase 4** (Visual rebuild) — after Phases 1+2+3 land + Stop-Agent API decision
4. Execute each phase's impl plan sequentially. Per-phase T1 is the first action. Mark TaskUpdate after each task.

---

## Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Other-agent merge conflicts | All | Pre-flight `git diff` per impl plan; rebase before each Step 4 |
| Sequential `taskId` breaks on `--resume` | 1 | Mitigation: log warning; v1.5 patch with `tool_result.taskId` reading |
| `--bg-4` semantic mismatch | 2 | Preserved as canonical; no rename |
| Synthetic-id leak into persistence | 3 | Audit table in spec; consumers handled per-site |
| Stop-Agent API missing | 4 | Feature flag fallback; ticket filed in backlog |
| Token totals undefined for synthetic agents | 3 + 4 | Render `—`, not `0` |

---

## Time estimates (when unblocked)

| Phase | Effort | Files | LOC est. |
|---|---|---|---|
| 1 | ~1h | 4 | ~200 |
| 2 | ~1h | 4 | ~600 (mostly CSS) |
| 3 | ~half day | 6 | ~400 |
| 4 | ~1 day | 6 | ~800 |
| 5 | ~5min | 1 | ~5 |

Total: ~3 days of focused work, contingent on prereqs.
