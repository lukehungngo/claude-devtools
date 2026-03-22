# Spec Compliance Reviewer Prompt

You are reviewing whether an implementation matches its task specification.

## Task Spec
{TASK_SPEC — paste the original task spec}

## Implementation Result
{RESULT — paste the engineer's result file}

## Review Checklist

1. **Objective met?** Does the implementation achieve what the task spec describes?
2. **Acceptance criteria?** Run each command — do they all pass?
3. **File scope?** Were only `relevant_files` modified? Were `do_not_touch` files left alone?
4. **Tests exist?** Does every new function/method have a corresponding test?
5. **No extras?** Did the engineer add unrequested features or refactoring?

## Output

```markdown
## Spec Compliance: TASK-{id}

- [PASS/FAIL] Objective met: {evidence}
- [PASS/FAIL] Acceptance criteria: {which passed/failed}
- [PASS/FAIL] File scope respected: {evidence}
- [PASS/FAIL] Tests present: {count}
- [PASS/FAIL] No scope creep: {evidence}

### Verdict: PASS / FAIL
{If FAIL: list specific issues to fix}
```
