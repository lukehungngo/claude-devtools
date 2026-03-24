---
description: Focused bug-fix loop — debug, fix with TDD, review, verify, finish
---

# Bug-Fix Loop (MAS)

Fix a bug for: $ARGUMENTS

## Mode

Check if `$ARGUMENTS` contains `--auto`. If yes → **autonomous mode** (no human checkpoints, run everything end-to-end). If no → **interactive mode** (pause for approval at key steps).

**`--auto` scope:** Skips human approval gates at Steps 1 and 7 only. It does NOT skip the Bug-Fixer, Reviewer, or verification. The full pipeline runs in both modes.

## Agent Pipeline

```
bug-fix (this command)
  │
  ├─ 1. Clarify ─── Skill(skill: "ask-questions")
  ├─ 2. Branch ─── git worktree
  ├─ 3. Debug ─── Skill(skill: "systematic-debugging")
  ├─ 4. Fix ─── Agent(subagent_type: "bug-fixer")
  │
  ├─ 5. Review ─── Agent(subagent_type: "reviewer")
  │       └─ BLOCKED? ──→ Agent(subagent_type: "bug-fixer") (max 2 cycles)
  │
  ├─ 6. Verify ─── Skill(skill: "verification")
  └─ 7. Finish ─── Skill(skill: "finishing-branch")
```

## Steps

### Step 1 — Clarify

```
Skill(skill: "ask-questions")
```

Clarify the bug before touching code:
- What is the exact symptom? (error message, wrong output, crash)
- How to reproduce it? (steps, input, environment)
- What is the expected vs actual behavior?
- Is there a specific file/line already identified?

- `--auto`: skip clarification, treat `$ARGUMENTS` as complete bug description.

**GATE:** Bug is reproducible and understood. Do NOT proceed to Step 2 with "it sometimes fails" or no reproduction steps.

---

### Step 2 — Branch

Create an isolated workspace:

```bash
git worktree add -b fix/{{bug-name}} .worktrees/{{bug-name}}
cd .worktrees/{{bug-name}}
```

Verify clean baseline: `cd server && pnpm test && cd ../dashboard && pnpm test` must pass.

**GATE:** You are in the worktree directory and baseline tests pass. If baseline already fails, document which tests were already failing before your fix — do NOT proceed as if they are yours to fix unless explicitly in scope.

---

### Step 3 — Debug

If the root cause is not already identified:

```
Skill(skill: "systematic-debugging")
```

This skill produces a confirmed root cause with a reproduction test. Skip only if the caller has already identified the exact file:line and cause.

**GATE:** Root cause is identified and a failing reproduction test exists. Do NOT dispatch Bug-Fixer without knowing exactly what is broken.

---

### Step 4 — Fix

Dispatch the Bug-Fixer with the reproduction test and root cause:

```
Agent(
  subagent_type: "bug-fixer",
  prompt: """
  ## Bug Description
  {paste bug description from Step 1}

  ## Root Cause
  {paste root cause from Step 3}

  ## Reproduction Test
  {paste the failing test from Step 3}

  ## Working Directory
  {worktree path}

  ## Output
  Write your result to docs/reports/bugfix-result.md
  """
)
```

- Interactive: present the Bug-Fixer's result to human before reviewing.
- `--auto`: proceed directly to Step 5.

**GATE:** `docs/reports/bugfix-result.md` exists and reports all tests passing. Do NOT proceed if the Bug-Fixer reports unresolved failures.

---

### Step 5 — Review

Dispatch the Reviewer to verify the fix is correct and doesn't introduce new issues:

```
Agent(
  subagent_type: "reviewer",
  prompt: """
  ## Bug Description
  {paste bug description}

  ## Root Cause
  {paste root cause}

  ## Bug-Fixer Result
  {paste from docs/reports/bugfix-result.md}

  ## Working Directory
  {worktree path}

  ## Output
  Write your review to docs/reports/bugfix-review.md
  Issue verdict: APPROVED / APPROVED WITH CHANGES / BLOCKED
  """
)
```

**On verdict (Review Loop — max 2 cycles):**

Track `review_cycle` starting at 0. After each review:

- **APPROVED / APPROVED WITH CHANGES** → exit loop, proceed to Step 6.
- **BLOCKED** (and `review_cycle < 2`):
  1. Increment `review_cycle`.
  2. Interactive: show blocking issues to human, ask "Re-fix automatically? (y/n)". If no → escalate.
  3. `--auto`: re-dispatch Bug-Fixer with the review report, then re-run this step.
- **BLOCKED** (and `review_cycle >= 2`) → stop and escalate to human. Do NOT dispatch a 3rd fix cycle.

**GATE:** `docs/reports/bugfix-review.md` exists with verdict APPROVED or APPROVED WITH CHANGES. Do NOT proceed with a BLOCKED verdict.

---

### Step 6 — Verify

```
Skill(skill: "verification")
```

**GATE:** `docs/reports/verification-{branch}.md` exists with verdict PASS. Do NOT proceed to Step 7 without this file.

---

### Step 7 — Finish

```
Skill(skill: "finishing-branch")
```

- Interactive: present options (merge/PR/keep/discard).
- `--auto`: create PR automatically.
- Include the bugfix review report in the branch summary.

---

## Rules

- Always reproduce the bug before fixing — a fix without a reproduction test is a guess
- The Bug-Fixer touches only the files in scope — no opportunistic refactoring
- Max 2 review cycles before escalating to human
- `--auto` still runs all agents and skills — it only skips human approval pauses
- Do NOT skip the Reviewer step — even obvious fixes can introduce regressions
- Do NOT use this command for feature work — use `/dev-loop` instead

## When to Use `/bug-fix` vs `/dev-loop`

| Use `/bug-fix` | Use `/dev-loop` |
|---------------|----------------|
| Known regression, clear symptom | New feature or behaviour change |
| Single root cause, targeted fix | Multiple tasks with dependencies |
| Fix scoped to 1-3 files | Requires Researcher or design step |
| Reviewer report already exists | Full planning needed |
