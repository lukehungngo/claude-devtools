---
name: verification
description: Use as final checklist before declaring any task or branch complete
---

# Verification Before Completion

## Overview

Never declare done without running this checklist. "It works on my machine" is not verification.

## Checklist

### Build Verification
- [ ] `echo "No linter configured"` — clean, zero warnings
- [ ] `cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit` — clean, zero errors
- [ ] `echo "No test runner configured"` — all pass, zero failures

### Code Verification
- [ ] `git diff` reviewed — no debug prints, no TODOs, no commented-out code
- [ ] No `.env`, credentials, or secrets in the diff
- [ ] All new functions have type annotations
- [ ] All new functions have tests
- [ ] Edge cases covered (null, empty, large input, concurrent access)

### Spec Verification
- [ ] Original task spec's objective is met
- [ ] All acceptance criteria commands pass
- [ ] Business context requirement is satisfied
- [ ] Only `relevant_files` were modified
- [ ] `do_not_touch` files are untouched

### Regression Verification
- [ ] Existing tests still pass (not just new tests)
- [ ] No unintended side effects on other modules
- [ ] Performance hasn't degraded (if applicable)

## If Any Check Fails

1. Fix the issue
2. Re-run the FULL checklist (not just the failed item)
3. Only declare done when ALL checks pass

## Anti-patterns

- Checking only new tests, not existing ones
- "It compiles" ≠ "it works"
- Skipping the diff review
- Declaring done and fixing "later"
