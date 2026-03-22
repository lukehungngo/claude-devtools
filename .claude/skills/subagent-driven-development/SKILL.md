---
name: subagent-driven-development
description: Use to execute plans via subagents with two-stage review (spec compliance + code quality)
---

# Subagent-Driven Development

## Overview

Dispatch a fresh subagent per task with two-stage review. Each subagent gets a clean context window, preventing context pollution between tasks.

**Mutually exclusive with:** `executing-plans` — use one or the other, not both.

## When to Use

- Plan is approved and ready to execute
- You have subagent support (Claude Code with Agent tool)
- Tasks benefit from isolated context (complex, multi-file changes)

## Process

### Per Design Task (has_ui: true only)

1. **Dispatch UI/UX Designer subagent** with:
   - The task spec (type: design)
   - Reference files for existing components/patterns
   - Reference to CLAUDE.md for project type and architecture

2. **Wait for design spec** (written to `tasks/done/TASK-{id}-design.md`)

3. **Attach design spec** to the dependent implementation task as `design_spec`

4. **Proceed** to dispatch the Engineer for the impl task (the design spec becomes input)

> Design tasks do not go through Stage 1/Stage 2 code review — they are reviewed by the Orchestrator for completeness (all sections filled: states, breakpoints, a11y).

### Per Implementation Task

1. **Dispatch Engineer subagent** with:
   - The task spec (from `.claude/templates/task-spec.md`)
   - The approved research proposal (if applicable)
   - The approved design spec (if applicable — UI tasks)
   - Reference to CLAUDE.md for architecture invariants

2. **Wait for completion**

3. **Stage 1 Review — Spec Compliance:**
   - Does the output match the task spec's objective?
   - Are all acceptance criteria met?
   - Were only `relevant_files` touched?

4. **Stage 2 Review — Code Quality:**
   - Dispatch Reviewer subagent with task spec + result
   - Read verdict: APPROVED / BLOCKED

5. **If BLOCKED:**
   - Dispatch Bug-Fixer subagent with reviewer report
   - Re-review (max 2 cycles)

6. **If APPROVED:**
   - Mark task done, proceed to next

### Parallel Dispatch

Check `parallel_safe` flag on tasks:
- `parallel_safe: true` → dispatch simultaneously
- `parallel_safe: false` → wait for dependencies to complete

### Subagent Prompt Template

```markdown
You are the Engineer agent for claude-devtools.

## Task
{paste full task spec}

## Context
- Read CLAUDE.md for architecture invariants
- Read `.claude/rules/` for project rules
- Follow TDD: failing test first, always

## Constraints
- Only modify files listed in `relevant_files`
- Do NOT touch files in `do_not_touch`
- Run lint + typecheck + tests before completing

## Output
Write result to `tasks/done/TASK-{id}-result.md`
```

## Anti-patterns

- Reusing the same subagent for multiple tasks (context pollution)
- Skipping Stage 1 review (spec compliance)
- Dispatching without the task spec (vague instructions)
- Ignoring `parallel_safe: false` flags
