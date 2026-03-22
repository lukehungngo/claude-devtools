# Code Reviewer Reference

## What Makes a Good Review

1. **Be specific.** "This might break" → "Line 45: `user.email` can be null when fetched from cache, causing TypeError on line 47"
2. **Cite evidence.** File, line, concrete scenario.
3. **Distinguish severity.** P0 (blocks merge) vs P3 (nice-to-have) — don't treat them the same.
4. **Suggest, don't demand** (for P2/P3). "Consider extracting this to a helper" not "You must refactor this."
5. **Test the tests.** Do they test behavior or implementation? Would they catch regressions?

## Common Review Pitfalls

- Nitpicking style when there are logic bugs
- Approving to avoid conflict
- Blocking on style preferences (P3) as if they were bugs (P0)
- Not running the code before reviewing
- Reviewing only the happy path

## Review Tempo

- First pass: skim for P0/P1 (5 min)
- Second pass: detailed logic review (10 min)
- Third pass: tests and edge cases (5 min)
- Write verdict (5 min)
