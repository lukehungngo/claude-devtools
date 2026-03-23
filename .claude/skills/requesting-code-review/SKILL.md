---
name: requesting-code-review
description: Use after implementation to dispatch a structured code review
---

# Requesting Code Review

## Overview

After implementation, dispatch the Reviewer agent with structured context for a two-phase review.

## When to Use

- After any task is implemented (before marking done)
- After bug fixes (before closing the review cycle)

## Process

1. **Prepare the review package:**
   - Original task spec
   - Git diff of all changes
   - Test results (pass count, new tests)
   - Build status (lint, typecheck, tests)

2. **Dispatch Reviewer** with the package

3. **Read the verdict:**
   - APPROVED → proceed to finish
   - APPROVED WITH CHANGES → note P2/P3 items, proceed
   - BLOCKED → dispatch Bug-Fixer, then re-review

## Review Request Template

```markdown
## Review Request: TASK-{id}

### Task Spec
{link or paste the task spec}

### Changes
{git diff or summary of files changed}

### Test Results
- New tests: {count}
- All tests: PASS ({total} tests)
- Lint: PASS
- Typecheck: PASS

### Notes
{Any context the reviewer should know}
```

## After Review

- **APPROVED:** Mark task done, move to `docs/tasks/done/`
- **BLOCKED:** Do NOT argue with the reviewer. Fix the issues via Bug-Fixer agent, then re-request review.
- **Max 2 review cycles.** If still BLOCKED after 2 cycles → escalate to human.
