---
name: executing-plans
description: Use to execute implementation plans in batches with human checkpoints (alternative to subagent-driven-development)
---

# Executing Plans

## Overview

Execute a plan's tasks sequentially in batches, with human checkpoints between batches. Use this when you don't have subagent support or prefer direct execution.

**Mutually exclusive with:** `subagent-driven-development` — use one or the other, not both.

## When to Use

- Plan is approved and ready to execute
- You're working in a single Claude session (no subagents)
- Tasks are small enough to execute directly

## Process

### Batch Execution

1. **Group tasks** by dependency — independent tasks form a batch
2. **Execute batch:**
   - For each task in the batch:
     - Mark task as in-progress
     - Follow TDD: write failing test → verify fail → minimal code → verify pass
     - Run lint + typecheck + tests
     - Mark task as done
3. **Checkpoint:** After each batch, summarize progress to human
4. **Next batch:** Continue only after human confirms

### Per-Task Checklist

- [ ] Read the task spec
- [ ] Write failing test
- [ ] Verify test fails for the right reason
- [ ] Write minimal code to pass
- [ ] Verify all tests pass
- [ ] Lint clean
- [ ] Mark done

### Error Handling

- **Test fails unexpectedly?** Stop. Debug. Don't proceed to next task.
- **Lint/typecheck fails?** Fix before moving on.
- **Task takes >10 min?** Stop. The task needs splitting. Report to human.
- **Blocked by unclear requirement?** Stop. Ask human. Don't guess.

## Output

After each batch:
```markdown
## Batch {N} Complete

### Tasks Done
- TASK-{id}: {title} ✓
- TASK-{id}: {title} ✓

### Build Status
- Tests: {X} pass, {Y} new
- Lint: clean
- Typecheck: clean

### Next Batch
- TASK-{id}: {title}
- TASK-{id}: {title}

### Issues
{Any blockers or concerns}
```
