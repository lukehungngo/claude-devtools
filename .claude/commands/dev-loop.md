---
description: Full development loop — ask, plan, orchestrate (MAS), review, finish
---

# Development Loop (MAS)

Execute the full mandatory workflow for: $ARGUMENTS

## Mode

Check if `$ARGUMENTS` contains `--auto`. If yes → **autonomous mode** (no human checkpoints, run everything end-to-end). If no → **interactive mode** (pause for approval at key steps).

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

4. **Orchestrate** — Dispatch the **Orchestrator agent** (`mas:orchestrator:orchestrator`) with the full context:

   Pass to the Orchestrator:
   - The original PRD / requirement (from $ARGUMENTS or clarified in step 1)
   - The approved implementation plan (from step 3)
   - The current working directory (worktree path)
   - The mode (`--auto` or interactive)

   The Orchestrator then autonomously:
   - Decomposes the plan into task specs (Phase 1)
   - Routes each task to the correct agent per its routing table — Researcher, Differential Reviewer, UI/UX Designer, Engineer (Phase 2)
   - Manages the Research Convergence Protocol for novel tasks (max 3 rounds)
   - Runs two-stage review after each implementation task — spec compliance + code quality (Phase 3)
   - Dispatches Bug-Fixer on BLOCKED verdicts (max 2 cycles, then escalate)
   - Verifies acceptance criteria per task (Phase 4)
   - Reports final status back: list of completed tasks, any escalations, any skipped tasks

   **The Orchestrator is the PM.** It owns all agent dispatch decisions. Do NOT call `subagent-driven-development` or dispatch Engineer/Reviewer/Researcher directly — the Orchestrator handles all routing.

   ```
   Agent(
     subagent_type: "mas:orchestrator:orchestrator",
     prompt: """
     You are the Orchestrator for this development session.

     ## PRD / Requirement
     {paste the original requirement}

     ## Approved Plan
     {paste the approved implementation plan from step 3}

     ## Mode
     {"autonomous" | "interactive"} — if autonomous, do not pause for human input;
     if interactive, escalate ambiguities but do not block on approvals
     (the human already approved the plan).

     ## Working Directory
     {worktree path}

     ## Instructions
     Follow your full Orchestrator process (Phase 0 → Phase 4).
     Decompose the approved plan into task specs, dispatch agents per your
     routing table, manage reviews, and verify acceptance criteria.

     Report back with:
     1. List of completed tasks and their status
     2. Any tasks that were escalated or skipped
     3. Any issues that need human attention
     """
   )
   ```

5. **Validate Requirements** — Holistic PRD validation. The Orchestrator's per-task reviews checked individual tasks, but this step checks that **all tasks together deliver what the PRD asked for**.

   Dispatch the **Reviewer agent** (`mas:reviewer:reviewer`) with a requirements-validation mandate:

   ```
   Agent(
     subagent_type: "mas:reviewer:reviewer",
     prompt: """
     You are performing a REQUIREMENTS VALIDATION — not a per-task code review.

     ## Original PRD / Requirement
     {paste the original requirement from step 1}

     ## Approved Plan
     {paste the approved plan from step 3}

     ## Orchestrator Report
     {paste the Orchestrator's completion report from step 4}

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
     Write your report to `docs/reports/requirements-validation.md`

     ```markdown
     ## Requirements Validation Report

     ### Requirement Coverage
     | # | Requirement | Status | Evidence |
     |---|-------------|--------|----------|
     | 1 | {from PRD}  | IMPLEMENTED / PARTIALLY / MISSING | {file:line or command output} |

     ### Cross-Cutting Concerns
     - [PASS/FAIL] {concern} — {evidence}

     ### Gaps
     {List any requirements not fully met, with specific details on what's missing}

     ### Verdict
     ALL MET / GAPS FOUND / CRITICAL GAPS
     ```
     """
   )
   ```

   **On verdict:**
   - **ALL MET** → proceed to step 6
   - **GAPS FOUND** → re-dispatch Orchestrator with the gap list to fill them (max 1 remediation cycle), then re-validate
   - **CRITICAL GAPS** → stop and escalate to human immediately
   - `--auto`: on GAPS FOUND, auto-remediate (1 cycle). On CRITICAL GAPS, still escalate.

6. **Verify** — Use `verification` skill for final technical checks:
   - All tests pass
   - Lint clean
   - Typecheck clean
   - No debug artifacts

7. **Finish** — Use `finishing-branch` skill.
   - Interactive: present options (merge/PR/keep/discard).
   - `--auto`: create PR automatically.
   - Include the Requirements Validation Report in the branch summary so the human sees coverage before deciding.

## Rules

- TDD is non-negotiable at every step
- The Orchestrator owns all agent dispatch — never bypass it
- Every task gets reviewed (spec compliance + code quality) via the Orchestrator's Phase 3
- Requirements validation (step 5) is mandatory — never skip it
- Stop on P0/P1 issues — do not proceed until fixed (`--auto`: Orchestrator auto-dispatches Bug-Fixer, escalates after 2 failed cycles)
- Max 2 review cycles per task before escalating
- Max 1 remediation cycle for requirements gaps before escalating
- `--auto` still respects TDD, reviews, validation, and quality gates — it only skips human checkpoints
- If the Orchestrator reports escalations or requirements validation finds CRITICAL GAPS, present them to the human before proceeding
