---
description: Full development loop — ask, explore, plan, design, orchestrate (MAS), review, finish
---

# Development Loop (MAS)

Execute the full mandatory workflow for: $ARGUMENTS

## Mode

Check if `$ARGUMENTS` contains `--auto`. If yes → **autonomous mode** (no human checkpoints, run everything end-to-end). If no → **interactive mode** (pause for approval at key steps).

## Agent Pipeline

```
dev-loop (this command)
  │
  ├─ 1. Clarify ─── Skill(skill: "ask-questions")
  ├─ 2. Branch ─── git worktree
  ├─ 3. Explore ─── Agent(subagent_type: "Explore")
  ├─ 4. Plan ─── Skill(skill: "writing-plans")
  │
  ├─ 5. Design (if has_ui: true) ─── Agent(subagent_type: "ui-ux-designer")
  │
  ├─ 6. Orchestrate ─── Agent(subagent_type: "orchestrator")
  │       │
  │       ├─ Researcher ↔ Differential Reviewer (novel tasks, max 3 rounds)
  │       ├─ Engineer (TDD implementation per task)
  │       ├─ Reviewer (two-stage: spec compliance + code quality)
  │       └─ Bug-Fixer (if Reviewer blocks, max 2 cycles)
  │
  ├─ 7. Validate ─── Agent(subagent_type: "reviewer")
  │       └─ GAPS FOUND? ──→ loop back to 6 (max 3 cycles)
  ├─ 8. Verify ─── Skill(skill: "verification")
  └─ 9. Finish ─── Skill(skill: "finishing-branch")
```

## Steps

### Step 1 — Clarify

```
Skill(skill: "ask-questions")
```

If the requirement has any ambiguity, this skill will surface questions before proceeding. If crystal clear, skip to step 2.

- `--auto`: skip clarification, assume requirements are complete as given.

**GATE:** Requirement is clarified (or `--auto` skips this step). Do NOT proceed to step 2 with unresolved ambiguities.

---

### Step 2 — Branch

Create an isolated workspace:

```bash
git worktree add -b feature/{{name}} .worktrees/{{name}}
cd .worktrees/{{name}}
```

Verify clean baseline: `cd server && pnpm test && cd ../dashboard && pnpm test` must pass.

**GATE:** You are in the worktree directory and baseline tests pass. Do NOT proceed if tests fail.

---

### Step 3 — Explore

Scan the codebase for relevant patterns, existing implementations, and integration points before planning.

```
Agent(
  subagent_type: "Explore",
  prompt: """
  Explore the codebase to understand:
  1. Existing patterns relevant to: {requirement summary}
  2. Files and modules that will be affected
  3. Integration points and dependencies
  4. Test patterns used in this area of the codebase

  Working directory: {worktree path}

  Return a structured summary containing:
  - Relevant files and their purpose
  - Existing patterns to reuse
  - Potential integration challenges
  """
)
```

This is a lightweight, read-only step. Its output feeds into the Plan step.

**GATE:** You have a codebase exploration summary. Do NOT plan without understanding the existing code.

---

### Step 4 — Plan

```
Skill(skill: "writing-plans")
```

This produces a structured implementation plan with TASK-{id} entries, exact file paths, verification commands, and dependency graphs.

**Do NOT use EnterPlanMode / PlanMode.** PlanMode is a different mechanism — it produces freeform text, NOT the structured TASK-{id} breakdown required here. The `writing-plans` skill follows a specific template with exact file paths, verification commands, and dependency graphs.

- Interactive: present plan to human for approval before proceeding.
- `--auto`: approve plan automatically and proceed.

**GATE:** The plan contains `TASK-` entries with file paths and verification commands. If not, the plan is incomplete — do NOT proceed.

---

### Step 5 — Design (if `has_ui: true`)

Before implementation, dispatch the **UI/UX Designer agent** to produce design specs for any UI-related tasks in the plan.

```
Agent(
  subagent_type: "ui-ux-designer",
  prompt: """
  You are the UI/UX Designer for this development session.

  ## PRD / Requirement
  {paste the original requirement}

  ## Approved Plan
  {paste the approved implementation plan from step 4}

  ## Working Directory
  {worktree path}

  ## Instructions
  For each UI-related task in the plan:
  1. Produce component specs (props, states, variants)
  2. Define state mapping (what data drives each component)
  3. Design interaction flows (user actions → state changes → UI updates)
  4. Write accessibility checklist (ARIA roles, keyboard nav, focus management)
  5. Create HTML wireframe mockups where helpful

  Write all design specs to docs/design/ using the naming convention:
  - docs/design/TASK-{id}-design.md for each task

  ## Output
  Return a summary of all design specs produced, listing:
  - Task ID → design spec path
  - Key design decisions made
  - Any questions or ambiguities that need human input
  """
)
```

- Interactive: present design specs to human for approval before proceeding.
- `--auto`: approve designs automatically and proceed.
- If `has_ui: false`: skip this step entirely.

**GATE:** Design specs exist in `docs/design/` for all UI tasks (or `has_ui: false` and step is skipped). Do NOT implement UI tasks without design specs.

---

### Step 6 — Orchestrate

Dispatch the **Orchestrator agent** with the full context. The Orchestrator is the PM — it owns all agent dispatch decisions.

```
Agent(
  subagent_type: "orchestrator",
  prompt: """
  You are the Orchestrator for this development session.

  ## PRD / Requirement
  {paste the original requirement}

  ## Approved Plan
  {paste the approved implementation plan from step 4}

  ## Codebase Context
  {paste the exploration summary from step 3}

  ## Design Specs (if has_ui: true)
  {paste design spec paths from step 5, or "N/A — has_ui: false"}

  ## Mode
  {"autonomous" | "interactive"}

  ## Working Directory
  {worktree path}

  ## Instructions
  Follow your full Orchestrator process (Phase 0 → Phase 4):

  Phase 1 — Decompose the plan into task specs → write to docs/tasks/pending/
  Phase 2 — Dispatch agents per routing table:
    - Novel tasks → Researcher (subagent_type: "researcher")
      → Differential Reviewer (subagent_type: "differential-reviewer") — max 3 rounds
      → on PROCEED → Engineer
    - UI tasks (has_ui: true) → Engineer with design spec from step 5
      (design specs already exist in docs/design/ — attach them to Engineer's task spec)
    - Known patterns → Engineer (subagent_type: "engineer") directly
    - All agents use LOCAL subagent_type (no prefix)
  Phase 3 — After each Engineer task:
    → Reviewer (subagent_type: "reviewer") — two-stage review
    → if BLOCKED → Bug-Fixer (subagent_type: "bug-fixer") — max 2 cycles
  Phase 4 — Verify acceptance criteria by reading result and review files, move to docs/tasks/done/

  Report back with:
  1. List of completed tasks and their status
  2. Any tasks that were escalated or skipped
  3. Any issues that need human attention
  """
)
```

**Do NOT call skills or dispatch agents directly** — the Orchestrator handles all routing through its agent pipeline.

**GATE:** `docs/tasks/done/` is non-empty (tasks were completed). Orchestrator has reported back with task status. Do NOT proceed if Orchestrator reports unresolved escalations — present them to the human first.

---

### Step 7 — Validate Requirements

Holistic PRD validation. The Orchestrator's per-task reviews checked individual tasks, but this step checks that **all tasks together deliver what the PRD asked for**.

```
Agent(
  subagent_type: "reviewer",
  prompt: """
  You are performing a REQUIREMENTS VALIDATION — not a per-task code review.

  ## Original PRD / Requirement
  {paste the original requirement from step 1}

  ## Approved Plan
  {paste the approved plan from step 4}

  ## Orchestrator Report
  {paste the Orchestrator's completion report from step 6}

  ## Instructions
  For EACH functional requirement in the PRD:
  1. Trace through the implemented code to verify it exists
  2. Run any relevant commands to confirm behavior
  3. Mark as: IMPLEMENTED / PARTIALLY IMPLEMENTED / MISSING

  Then check cross-cutting concerns:
  - Do the implemented tasks integrate correctly with each other?
  - Are there PRD requirements that fell between task boundaries?
  - Are edge cases mentioned in the PRD handled?
  - Does the overall system behavior match what was specified?

  ## Output
  Write your report to docs/reports/requirements-validation-r{remediation_cycle}.md
  (r0 = initial validation, r1 = after 1st remediation, etc.)

  ### Requirement Coverage
  | # | Requirement | Status | Evidence |
  |---|-------------|--------|----------|
  | 1 | {from PRD}  | IMPLEMENTED / PARTIALLY / MISSING | {file:line or command output} |

  ### Cross-Cutting Concerns
  - [PASS/FAIL] {concern} — {evidence}

  ### Gaps
  {List any requirements not fully met}

  ### Verdict
  ALL MET / GAPS FOUND / CRITICAL GAPS
  """
)
```

**On verdict (Remediation Loop — max 3 cycles):**

Track `remediation_cycle` starting at 0. After each validation:

- **ALL MET** → exit loop, proceed to step 8.
- **GAPS FOUND** (and `remediation_cycle < 3`):
  1. Increment `remediation_cycle`.
  2. Interactive: present gap list to human, ask "Remediate automatically? (y/n)". If no → escalate.
  3. `--auto`: proceed without asking.
  4. Re-dispatch Orchestrator with a **remediation prompt** (see below).
  5. After Orchestrator completes → re-run this Validate step (step 7).
- **GAPS FOUND** (and `remediation_cycle >= 3`) → escalate to human with all validation reports (`r0` through `r3`).
- **CRITICAL GAPS** → stop and escalate to human immediately, regardless of cycle count.

**Remediation Orchestrator Dispatch (used on GAPS FOUND retry):**

```
Agent(
  subagent_type: "orchestrator",
  prompt: """
  You are the Orchestrator performing REMEDIATION CYCLE {remediation_cycle} of 3.

  ## Original PRD / Requirement
  {paste the original requirement}

  ## Latest Validation Report
  {paste the full validation report from docs/reports/requirements-validation-r{remediation_cycle - 1}.md}

  ## Gaps to Fix
  {paste only the ### Gaps section from the validation report}

  ## Previously Completed Tasks
  {list task IDs and one-line summaries from docs/tasks/done/ — do NOT redo these}

  ## Design Specs (if has_ui: true)
  {paste design spec paths from step 5, or "N/A — has_ui: false"}

  ## Mode
  {"autonomous" | "interactive"}

  ## Working Directory
  {worktree path}

  ## Instructions
  Focus ONLY on the gaps listed above. Do NOT re-implement already-completed tasks.

  For each gap:
  1. Create a new task spec (TASK-{next-id}) targeting the specific gap
  2. Route through your normal pipeline (Phase 2-4)
  3. Verify the gap is closed before declaring DONE

  This is remediation cycle {remediation_cycle} of 3. If you cannot close a gap,
  report it explicitly so the next validation can track persistent issues.

  Report back with:
  1. List of remediation tasks and their status
  2. Which gaps from the validation report are now addressed
  3. Any gaps that could NOT be addressed and why
  """
)
```

**GATE:** A validation report exists at `docs/reports/requirements-validation-r*.md` with verdict ALL MET. Do NOT proceed to step 8 without passing validation.

---

### Step 8 — Verify

```
Skill(skill: "verification")
```

Final technical checks:

- All tests pass
- Lint clean
- Typecheck clean
- No debug artifacts

**GATE:** All checks pass. Do NOT proceed to step 9 with failing tests or lint errors.

---

### Step 9 — Finish

```
Skill(skill: "finishing-branch")
```

- Interactive: present options (merge/PR/keep/discard).
- `--auto`: create PR automatically.
- Include the Requirements Validation Report in the branch summary so the human sees coverage before deciding.

---

## Agent Reference

All agents use **local subagent_type** (no `mas:` prefix — these are local after bootstrap):

| Agent                 | subagent_type           | Role                                                                                             |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| Orchestrator          | `orchestrator`          | PM — decomposes, dispatches, verifies. No Bash — can only read and dispatch.                     |
| Engineer              | `engineer`              | TDD implementation, writes to `docs/results/`. Uses Write/Edit for code, Bash only for commands. |
| Reviewer              | `reviewer`              | Two-stage review, writes to `docs/reports/`                                                      |
| Researcher            | `researcher`            | Explores approaches, writes to `docs/plans/`                                                     |
| Differential Reviewer | `differential-reviewer` | Stress-tests proposals, writes to `docs/reports/`                                                |
| Bug-Fixer             | `bug-fixer`             | TDD fixes from reviewer reports, writes to `docs/reports/`                                       |
| UI/UX Designer        | `ui-ux-designer`        | Design specs + HTML mockups, writes to `docs/design/`                                            |

## Rules

- TDD is non-negotiable at every step
- The Orchestrator owns all agent dispatch — never bypass it
- The Orchestrator does NOT have Bash — it dispatches agents for all implementation and command execution
- Always use local subagent_type (no `mas:` prefix)
- Every task gets reviewed (spec compliance + code quality) via the Orchestrator's Phase 3
- Requirements validation (step 7) is mandatory — never skip it
- Stop on P0/P1 issues — do not proceed until fixed (`--auto`: Orchestrator auto-dispatches Bug-Fixer, escalates after 2 failed cycles)
- Max 2 review cycles per task before escalating
- Max 3 remediation cycles for requirements gaps before escalating
- `--auto` still respects TDD, reviews, validation, and quality gates — it only skips human checkpoints
- `--auto` retries up to 3 remediation cycles on GAPS FOUND before escalating
- If the Orchestrator reports escalations or requirements validation finds CRITICAL GAPS, present them to the human before proceeding
- Do NOT use EnterPlanMode / PlanMode — use Skill(skill: "writing-plans") for structured plans
- Do NOT dispatch Explorer agents ad-hoc — codebase exploration happens in step 3 only
- Each step has a GATE — do NOT skip gates

## Lessons Learned (from battle testing)

These rules exist because every one of these failures happened in real sessions. Do not repeat them.

| #   | Failure                                         | What happened                                                                                                                                                                | Fix applied                                                                                           |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **Skills never invoked**                        | 0/5 sessions called Skill tool. Steps said "use X skill" — model skipped them all.                                                                                           | Every step now shows exact `Skill(skill: "X")` call.                                                  |
| 2   | **Orchestrator did everything inline**          | Orchestrator used Bash (70 calls in S1) instead of dispatching agents. Zero Agent tool calls.                                                                                | Bash removed from Orchestrator's tool list. It physically cannot run commands — must dispatch agents. |
| 3   | **Engineer used Bash for code**                 | 0 Write/Edit calls. All code written via `cat <<EOF`, `echo`, `sed`.                                                                                                         | Engineer CLAUDE.md now bans Bash for file writes with BAD/GOOD examples.                              |
| 4   | **Researcher/Differential Reviewer never used** | Model always classified tasks as "known pattern" and went straight to Engineer. Researcher used once reactively (agent #17 of 19). Differential Reviewer: 0 dispatches ever. | Orchestrator now requires routing decision log with justification. Novel task criteria made explicit. |
| 5   | **PlanMode replaced writing-plans**             | 3/5 sessions used EnterPlanMode instead of the skill. PlanMode produces freeform text, not structured TASK-{id} breakdown.                                                   | Explicit ban on PlanMode. Step 4 shows exact Skill call.                                              |
| 6   | **No cycle limit enforcement**                  | S1 had 6 bug-fix rounds (spec says max 2). No counter, no stop mechanism.                                                                                                    | Orchestrator Phase 3 now tracks `review_cycle` per task with hard stop at 2.                          |
| 7   | **Explorer agents dispatched ad-hoc**           | 4/5 sessions dispatched Explorer as first step — not in pipeline.                                                                                                            | Formalized as step 3 (Explore). Banned ad-hoc exploration elsewhere.                                  |
| 8   | **Verification step always skipped**            | 0/5 sessions called verification skill. Tests were run via raw Bash but structured checklist never triggered.                                                                | Step 8 shows exact Skill call with GATE check.                                                        |

**The meta-lesson:** Prose instructions get skipped. Structural constraints (removing tools, requiring exact tool call syntax, adding file-existence gates) are harder to bypass than rules that say "you MUST".
