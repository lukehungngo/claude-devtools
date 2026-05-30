# Agent Graph — running-status fix, repo/session picker, graph summary

**Date:** 2026-05-29
**Status:** done — E2E-verified (live API + browser screenshots)
**Scope:** dashboard Agent Graph tab + server status derivation

Three independent changes to the Agent Graph, driven by one goal:
1. Fix the bug where agent nodes are always "finished" (never "running").
2. Improve repo + session picking UX.
3. Add a graph summary (total / running / finished / by type).

---

## 1. Running-status bug — root cause & fix (DONE, E2E-verified)

**Symptom:** every node renders "Finished"; no node ever shows "Running", even for an actively-running session.

**Two root causes (both proven against JSONL ground truth, session 98269c6b):**

### Cause A — `turn_duration` Signal 2 leak (`server/src/analyzer/agentStatus.ts`)
`isAgentCompleted("main")` Signal 2 returned `true` for **any** `turn_duration` event anywhere in the stream. Every multi-turn session has prior-turn `turn_duration` events, so the main agent was always "completed" — even when the current turn was mid-flight (last main assistant `stop_reason=tool_use`, no closing `turn_duration`). `getAgentStatus` checks `isAgentCompleted` before liveness, so the running state was unreachable.

Ground truth: last main assistant `stop_reason=tool_use` at idx 2110; last `turn_duration` at idx 1859 (**before** it). Yet status was "completed".

**Fix:** Signal 2 counts a `turn_duration` only if it occurs **after** the last main assistant event (i.e. closes the current turn). Pure function, no timer. Mirrored in `dashboard/src/lib/agentStatus.ts`.

### Cause B — error precedence over liveness (`server/src/analyzer/dag-builder.ts`)
`deriveStatus` returned `"error"` whenever `hasError` was true, **before** consulting liveness. Long agentic sessions hit tool errors constantly, so a live, mid-flight main with a past tool error was branded `"error"`. The graph is a **2-mode view (running | finished)** with no error visual (`AgentFlowNode.nodeMode`), so `"error"` renders as "Finished" → never "Running".

**Fix:** precedence is now **active (running) > error > completed**. A genuinely running agent is `"active"` even with past tool errors (errors don't stop an agent — it processes the result and continues). Error precedence applies only once the agent is no longer running, so non-running errored agents still resolve to `"error"`.

**Verification:** server analyzer suite 290/290; dashboard agentStatus+turnSnapshot 109/109; live API on the running session now reports `main.status: "active"` (was `"error"`), `{active:1, completed:6, error:8}`.

---

## 2. Repo + session picker — two-step (repo → session)

**Decision:** replace the single combined combobox with a two-step selector: a **repo selector** then a **session selector** scoped to the chosen repo. Rationale: at scale (many repos × many sessions) a single flat list is long; picking the repo first cuts the session list to one repo and clarifies the mental model. Preserve all hardened behaviors (keyboard nav, aria, focus management, outside-click close, status dots).

- **Props unchanged:** `{ repos, value, onChange }` — `GraphPage` wiring stays the same. The "current repo" is derived from `value` (or defaults to the repo of the selected session / first repo).
- **Repo selector:** compact dropdown listing repos by name with a session count + a live dot when the repo has active sessions. Selecting a repo opens/!switches the session list to that repo and auto-selects its most-recent session (active-first).
- **Session selector:** dropdown of that repo's sessions; rows show status dot, short id, `live`/relative time, and agent/subagent count. Filter input + full keyboard nav retained.
- **Component split:** `RepoSelect.tsx`, `SessionSelect.tsx`, and a thin `SessionPicker.tsx` composing them. Pure helpers (`reposToOptions`, `sessionsForRepo`, default-session pick) unit-tested.

---

## 3. Graph summary — floating overlay on canvas (user choice)

**Decision:** a small panel pinned to a corner of the react-flow canvas (a map-legend style overlay), collapsible, never obstructing the graph center.

- **Pure transform:** `summarizeDag(dag, runningAgentIds)` → `{ total, running, finished, byType: {type, count}[] }`. `running = runningAgentIds.size ∩ nodes`; `finished = total - running` (mirrors the node's 2-mode model — error & completed both count as finished). `byType` groups by `node.type` (main + agent roles), sorted desc. Pure + unit-tested.
- **Component `GraphSummary.tsx`:** rendered via react-flow `<Panel position="top-left">`. Shows total, a running count (accent + spinner dot) and finished count (green), and a compact type legend (top N types with counts; "+k more" overflow). `dt-*` tokens, lucide icons, `tabular-nums`. Collapsible (chevron) to a single line. Subtle gsap fade/scale entrance via `useGSAP` with a scoped ref; respects `prefers-reduced-motion`.
- a11y: `aria-label` summarizing counts; status conveyed by icon + label + color (not color alone).

---

## Architecture invariants respected
Metrics server-side (status from `computeMetrics`); summary is a pure client transform over the already-fetched dag. No new fetches, O(nodes) once per dag change. No new UI deps (react-flow `Panel`, existing gsap, lucide). dt-* tokens, named exports.
