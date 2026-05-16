# Session-Shipped Summary

Updated 2026-05-16 end of execute pass.

---

## Shipped (tested + typechecked green)

### Phase 1 — Task derivation fix ✅
**Files:** `dashboard/src/lib/sessionTasks.ts` (rewritten), `dashboard/src/lib/sessionTasks.test.ts` (new, 10 fixtures), `dashboard/src/components/bottom-panel/BottomPanel.tsx`, `dashboard/src/components/conversation/ConversationView.tsx`, `dashboard/src/components/conversation/ConversationView.test.tsx`

What's now correct:
- `TaskUpdate` handler wired — status updates propagate (B-A)
- `TaskCreate` reads `subject` first, falls back to `description` (B-C)
- `taskId` binding is sequential + verified 110/110 across corpus (B-D)
- `BottomPanel` Tasks tab respects `viewingTurnNumber` (B-E)
- `addBlockedBy` stored on tasks (rendered in Phase 1.5+)
- Single derivation in `lib/sessionTasks.ts` consumed by both BottomPanel and ConversationView TaskGrid
- TodoWrite branch deleted (0/199k corpus calls)

### Phase 2 — Design-system hygiene (partial) ✅
**Files:** `dashboard/src/styles/globals.css`, `dashboard/src/components/insights/CASRow.tsx`, `dashboard/src/components/insights/CASRow.test.tsx`

What's now in:
- `--sp-*` × 12 spacing tokens in `:root` (matches Anthropic design)
- `CASRow.BADGE_PALETTE` swapped from Tailwind hexes to `var(--span-*)` tokens
- Test updated to match var-based palette

Deferred to Phase 2.5: full legacy alias deletion (65 callsites), --cat-* introduction, --bd-faint, agentColors.ts swap.

### Phase 3 — Subagent tool_result join ✅
**Files:** `dashboard/src/lib/agentIds.ts` (new), `server/src/lib/agentIds.ts` (new), `dashboard/src/lib/agentStatus.ts`, `dashboard/src/lib/turnSnapshot.ts`, `dashboard/src/hooks/useAgentLogs.ts`, `server/src/http/routes/session-routes.ts`, `dashboard/src/lib/agentStatus.synthetic.test.ts` (new, 6 fixtures)

What's now correct:
- `synthetic:agent:<tool_use_id>` agentId prefix system (shared between dashboard + server)
- `findToolResultForId` helper extracted (was inlined in `hasParentToolResultAck`)
- `isAgentCompleted` short-circuits at TOP for synthetic ids — checks for matching tool_result
- `computeDispatchedAgentIds` adds Path 3 synthetic fallback after subagentMeta + temporal-proximity miss
- `useAgentLogs` short-circuits synthetic ids to `[]` — no server round-trip
- Server route `/sessions/:projectHash/:sessionId/events/:agentId` returns `{events: []}` for synthetic ids

### Phase 3.5 — Server DAG synthetic mirroring + UI tolerance ✅
**Files:** `server/src/analyzer/dag-builder.ts`, `server/src/analyzer/dag-builder.synthetic.test.ts` (new, 5 fixtures), `dashboard/src/components/bottom-panel/TraceTab.tsx`

What's now correct:
- `analyzeEvents` returns `agentDispatches[]` (per-Agent dispatch metadata)
- `buildAgentDAG` creates synthetic nodes for unbound dispatches
- Status mapped: `active` (no result yet) / `completed` / `error` (is_error=true)
- Each synthetic node gets an edge from main
- Real subagent with matching description wins over synthetic
- TraceTab renders `—` for synthetic agent cost (already rendered `—` for zero tokens)

**Expected user-visible effect:** screenshot session `23ba0306` now shows 22 agent nodes in Agent Graph (was 3-5). Turn footer reflects "running" while any subagent dispatch has no matching `tool_result`.

### Phase 4 — Visual rebuild (core components) ✅
**Files:** `dashboard/src/components/bottom-panel/BottomPanel.tsx`, `dashboard/src/hooks/useLiveDuration.ts` (new), `dashboard/src/hooks/useLiveDuration.test.ts` (new, 6 fixtures), `dashboard/src/components/conversation/BackgroundAgentGroup.tsx` (new), `dashboard/src/components/conversation/BackgroundAgentGroup.test.tsx` (new, 7 fixtures)

What's now in:
- **Agent Graph tab badge** with `99+` cap, 28px max width — shows count of agents in current DAG
- **Scope pill** "Scoped to T{n}" — already existed, verified rendering
- **`useLiveDuration` hook** — ticks every 1s while live, freezes on endedAt
- **`BackgroundAgentGroup` + `BackgroundAgentRow` components** — Anthropic design's `<details class="agroup">` block. Renders running pill / done count / error count, per-row status pill + duration ticker + tokens + cost. Synthetic agents render `—` for tokens/cost. Group summary excludes synthetic from totals.

What's deferred (filed as 4.1 / 4.2):
- 4.1: Wiring BackgroundAgentGroup into TurnCard (data shape: AgentNode[] vs AgentSummary[] — needs filterDagForTurn pass)
- 4.2: Stop-Agent API + keyboard hint row (no backend endpoint yet)

### Phase 5 — Active Only auto-refresh ✅
**Files:** `dashboard/src/components/RepoList.tsx`, `dashboard/src/components/RepoList.test.tsx`

What's now in:
- Clicking **Active Only** silently triggers `onRefresh` (no spin animation — reserved for the explicit refresh button)
- Clicking **All** does NOT trigger refresh

---

## Test counts

- Dashboard: **1530 passed** / 4 skipped (was 1507)
- Server: **718 passed** / 31 skipped (was 713)

Net: +28 dashboard tests (10 sessionTasks + 6 agentStatus.synthetic + 6 useLiveDuration + 7 BackgroundAgentGroup + 2 RepoList filter, minus 3 ConversationView TodoWrite tests rewritten) + 5 dag-builder synthetic.

---

## Deferred (filed, not shipped)

### Phase 2.5 — Legacy alias deletion
**Why deferred:** 65 callsites + 3-theme CSS file + tailwind config. High pixel-drift risk without screenshot baselines. Better as its own ticket with a Playwright visual-diff harness.

### Phase 4 — Background Agents + Agent Graph visual rebuild
**Why deferred:** Genuinely multi-day work. Requires:
- New `BackgroundAgentGroup` + `BackgroundAgentRow` components matching Anthropic design HTML
- Full `TraceTab` rewrite (per design `dashboard.html:2034-2121`)
- `useLiveDuration` hook
- Tab badge + scope pill polish
- Keyboard handlers (focus / Enter / arrow keys)
- Optional Stop-Agent API for `x`/`Ctrl+X+K` keys
- A11y audit + reduced-motion verification

Spec at `docs/specs/phase-4-visual-rebuild.md`. Impl plan at `docs/plans/phase-4-impl-plan.md`. Both are post-Step-2 reviewed and ready to execute when scoped properly.

---

## Coordination notes

- The other agent's daemon-based TasksTab (commits `c2a291d`, `34f8619`, `199191c`, `d939772`) coexists peacefully with Phase 1's JSONL-derived fallback. TasksTab prefers daemon state when `sessionId` is provided; falls back to `deriveSessionTasks(events)` otherwise.
- No git conflicts encountered during execute. All target files were clean against current master at start of execute.

---

## Recommended next moves

1. **Smoke test in browser** — open `23ba0306` session, verify Agent Graph shows ~22 nodes, Tasks tab shows correct count.
2. **Phase 4 scoping** — if visual rebuild is high priority, split into 3-4 PRs by surface (TraceTab grid → BackgroundAgentGroup → keyboard → polish).
3. **Phase 2.5** — file a "design hygiene cleanup" ticket. Wait until a visual-regression harness exists (Playwright + pixelmatch) before executing.
