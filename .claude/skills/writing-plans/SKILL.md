---
name: writing-plans
description: Use after requirements are clear to create implementation plans with bite-sized tasks
---

# Writing Implementation Plans

## Overview

Break work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code approach, and verification steps.

## When to Use

- After requirements are clarified (post ask-questions)
- Before any implementation begins
- When a task is too large for a single agent invocation

## Plan Structure

```markdown
# Implementation Plan: {title}

## Goal
{One sentence: what are we building and why?}

## Tasks

### TASK-001: {title}
- **Agent:** engineer
- **Files:** {exact paths to create/modify}
- **Approach:** {what to do, in 2-3 sentences}
- **Tests:** {what tests to write}
- **Verify:** `{shell command to verify}`
- **Depends on:** none
- **Est:** 2-5 min

### TASK-002: {title}
- **Agent:** engineer
- **Files:** {exact paths}
- **Approach:** {what to do}
- **Tests:** {what tests}
- **Verify:** `{command}`
- **Depends on:** TASK-001
- **Est:** 2-5 min

## Dependency Graph
TASK-001 → TASK-002 → TASK-003
                    ↘ TASK-004 (parallel safe)

## Risk Assessment
- {What could go wrong and how to mitigate}
```

## Rules

1. **Each task must be completable in 2-5 minutes** — if longer, split it
2. **Each task must have a verification command** — no "manually check" steps
3. **File paths must be exact** — no "somewhere in src/"
4. **Dependencies must be explicit** — tasks without dependencies can run in parallel
5. **Tests are part of the task, not a separate task** — TDD means test + code together
6. **Plan must be reviewed before execution** — present to human for approval

## UI Tasks (has_ui: true only)

For projects with a UI, design tasks precede implementation tasks:

```markdown
### TASK-001: Design user profile card
- **Agent:** ui-ux-designer
- **Files:** reference: src/components/Card.tsx, src/styles/tokens.ts
- **Approach:** Define component spec with states (loading, empty, error, populated), responsive breakpoints, and accessibility checklist
- **Tests:** N/A (design spec, not code)
- **Verify:** `test -f tasks/done/TASK-001-design.md`
- **Depends on:** none
- **Est:** 3 min

### TASK-002: Implement user profile card
- **Agent:** engineer
- **Files:** src/components/ProfileCard.tsx, src/components/ProfileCard.test.tsx
- **Approach:** Implement per design spec from TASK-001. TDD all states.
- **Tests:** All states (loading, empty, error, populated), responsive behavior, a11y
- **Verify:** `npm test -- --grep ProfileCard`
- **Depends on:** TASK-001
- **Est:** 5 min
```

The design task outputs a spec; the impl task consumes it. Always chain them with an explicit dependency.

## Good vs Bad Tasks

| Good | Bad |
|------|-----|
| "Add `validate_email()` to `src/utils.py` with test" | "Implement validation" |
| "Create `UserSchema` in `src/models/user.py`" | "Set up the models" |
| "Add rate limit middleware to `src/middleware/`" | "Handle rate limiting" |
| "Design settings page (ui-ux-designer)" | "Make the settings page look nice" |

## Plan Review Checklist

- [ ] Every task has exact file paths
- [ ] Every task has a verification command
- [ ] Dependencies form a DAG (no cycles)
- [ ] No task takes more than 5 minutes
- [ ] TDD is baked into each task (not separate)
- [ ] UI tasks have a design task before the impl task (if has_ui: true)
- [ ] Risk assessment is realistic
