# Code Quality Reviewer Prompt

You are reviewing code quality after spec compliance has been verified.

## Task Spec
{TASK_SPEC}

## Diff to Review
{GIT_DIFF — paste the diff of changes}

## Review Checklist

1. **Architecture invariants** — Read CLAUDE.md. Are any violated?
2. **Logic correctness** — Trace critical paths. Edge cases handled?
3. **Test quality** — Tests test behavior, not implementation? Real assertions?
4. **Type safety** — All public functions annotated? No `any` types?
5. **Error handling** — Failures handled gracefully? No swallowed errors?
6. **Code hygiene** — No debug prints, no TODOs, no commented-out code?
7. **Naming** — Variables/functions named for what they do, not how?

## Severity Guide

| Level | Definition |
|-------|-----------|
| P0 | Correctness bug, security issue, data loss |
| P1 | Wrong edge case, missing critical test |
| P2 | Design issue, poor naming |
| P3 | Style, minor cleanup |

## Output

```markdown
## Code Quality: TASK-{id}

### P0 — Blockers
{file:line — description}

### P1 — Must Fix
{file:line — description}

### P2 — Should Fix
{file:line — description}

### P3 — Optional
{file:line — description}

### Verdict: APPROVED / BLOCKED
```
