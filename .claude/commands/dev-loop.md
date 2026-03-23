---
description: Full development loop — ask, plan, design, orchestrate (MAS), review, finish
---

# Development Loop (MAS)

Execute the full mandatory workflow for: $ARGUMENTS

## Mode

Check if `$ARGUMENTS` contains `--auto`. If yes → **autonomous mode** (no human checkpoints, run everything end-to-end). If no → **interactive mode** (pause for approval at key steps).

## Agent Pipeline

```
dev-loop (this command)
  │
  ├─ 1. Clarify (ask-questions skill)
  ├─ 2. Branch (git worktree)
  ├─ 3. Plan (writing-plans skill)
  │
  ├─ 4. Design (if has_ui: true) ─── UI/UX Designer agent
  │
  ├─ 5. Orchestrate ─── Orchestrator agent (PM)
  │       │
  │       ├─ Researcher ↔ Differential Reviewer (novel tasks, max 3 rounds)
  │       ├─ Engineer (TDD implementation per task)
  │       ├─ Reviewer (two-stage: spec compliance + code quality)
  │       └─ Bug-Fixer (if Reviewer blocks, max 2 cycles)
  │
  ├─ 6. Validate ─── Reviewer agent (holistic PRD check)
  │       └─ GAPS FOUND? ──→ loop back to 5 (max 3 cycles)
  ├─ 7. Verify (verification skill)
  └─ 8. Finish (finishing-branch skill)
```

## Steps

1. **Clarify** — Use `ask-questions` skill. If the requirement has any ambiguity, ask before proceeding. If crystal clear, skip to step 2.
   - `--auto`: skip clarification, assume requirements are complete as given.

2. **Branch** — Create an isolated workspace:
   ```bash
   git worktree add -b feature/{{name}} .worktrees/{{name}}
   cd .worktrees/{{name}}
   ```
   Verify clean baseline: `cd server && pnpm test && cd ../dashboard && pnpm test` must pass.

3. **Plan** — Use `writing-plans` skill to create an implementation plan with bite-sized tasks (2-5 min each).
   - Interactive: present plan to human for approval before proceeding.
   - `--auto`: approve plan automatically and proceed.

4. **Design** (if `has_ui: true`) — Before implementation, dispatch the **UI/UX Designer agent** to produce design specs for any UI-related tasks in the plan.

   ```
   Agent(
     subagent_type: "ui-ux-designer",
     prompt: """
     You are the UI/UX Designer for this development session.

     ## PRD / Requirement
     {paste the original requirement}

     ## Approved Plan
     {paste the approved implementation plan from step 3}

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

5. **Orchestrate** — Dispatch the **Orchestrator agent** with the full context (including design specs if produced). The Orchestrator is the PM — it owns all agent dispatch decisions.

   ```
   Agent(
     subagent_type: "orchestrator",
     prompt: """
     You are the Orchestrator for this development session.

     ## PRD / Requirement
     {paste the original requirement}

     ## Approved Plan
     {paste the approved implementation plan from step 3}

     ## Design Specs (if has_ui: true)
     {paste design spec paths from step 4, or "N/A — has_ui: false"}

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
       - UI tasks (has_ui: true) → Engineer with design spec from step 4
         (design specs already exist in docs/design/ — attach them to Engineer's task spec)
       - Known patterns → Engineer (subagent_type: "engineer") directly
       - All agents use LOCAL subagent_type (no prefix)
     Phase 3 — After each Engineer task:
       → Reviewer (subagent_type: "reviewer") — two-stage review
       → if BLOCKED → Bug-Fixer (subagent_type: "bug-fixer") — max 2 cycles
     Phase 4 — Verify acceptance criteria, move to docs/tasks/done/

     Report back with:
     1. List of completed tasks and their status
     2. Any tasks that were escalated or skipped
     3. Any issues that need human attention
     """
   )
   ```

   **Do NOT call skills or dispatch agents directly** — the Orchestrator handles all routing through its agent pipeline.

6. **Validate Requirements** — Holistic PRD validation. The Orchestrator's per-task reviews checked individual tasks, but this step checks that **all tasks together deliver what the PRD asked for**.

   ```
   Agent(
     subagent_type: "reviewer",
     prompt: """
     You are performing a REQUIREMENTS VALIDATION — not a per-task code review.

     ## Original PRD / Requirement
     {paste the original requirement from step 1}

     ## Approved Plan
     {paste the approved plan from step 3}

     ## Orchestrator Report
     {paste the Orchestrator's completion report from step 5}

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

   - **ALL MET** → exit loop, proceed to step 7.
   - **GAPS FOUND** (and `remediation_cycle < 3`):
     1. Increment `remediation_cycle`.
     2. Interactive: present gap list to human, ask "Remediate automatically? (y/n)". If no → escalate.
     3. `--auto`: proceed without asking.
     4. Re-dispatch Orchestrator with a **remediation prompt** (see below).
     5. After Orchestrator completes → re-run this Validate step (step 6).
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
     {paste design spec paths from step 4, or "N/A — has_ui: false"}

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

7. **Verify** — Use `verification` skill for final technical checks:
   - All tests pass
   - Lint clean
   - Typecheck clean
   - No debug artifacts

8. **Finish** — Use `finishing-branch` skill.
   - Interactive: present options (merge/PR/keep/discard).
   - `--auto`: create PR automatically.
   - Include the Requirements Validation Report in the branch summary so the human sees coverage before deciding.

## Agent Reference

All agents use **local subagent_type** (no `mas:` prefix — these are local after bootstrap):

| Agent | subagent_type | Role |
|-------|---------------|------|
| Orchestrator | `orchestrator` | PM — decomposes, dispatches, verifies |
| Engineer | `engineer` | TDD implementation, writes to `docs/results/` |
| Reviewer | `reviewer` | Two-stage review, writes to `docs/reports/` |
| Researcher | `researcher` | Explores approaches, writes to `docs/plans/` |
| Differential Reviewer | `differential-reviewer` | Stress-tests proposals, writes to `docs/reports/` |
| Bug-Fixer | `bug-fixer` | TDD fixes from reviewer reports, writes to `docs/reports/` |
| UI/UX Designer | `ui-ux-designer` | Design specs + HTML mockups, writes to `docs/design/` |

## Rules

- TDD is non-negotiable at every step
- The Orchestrator owns all agent dispatch — never bypass it
- Always use local subagent_type (no `mas:` prefix)
- Every task gets reviewed (spec compliance + code quality) via the Orchestrator's Phase 3
- Requirements validation (step 6) is mandatory — never skip it
- Stop on P0/P1 issues — do not proceed until fixed (`--auto`: Orchestrator auto-dispatches Bug-Fixer, escalates after 2 failed cycles)
- Max 2 review cycles per task before escalating
- Max 3 remediation cycles for requirements gaps before escalating
- `--auto` still respects TDD, reviews, validation, and quality gates — it only skips human checkpoints
- `--auto` retries up to 3 remediation cycles on GAPS FOUND before escalating
- If the Orchestrator reports escalations or requirements validation finds CRITICAL GAPS, present them to the human before proceeding
