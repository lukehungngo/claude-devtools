---
name: finishing-branch
description: Use after all tasks are complete to verify, present options, and clean up the branch
---

# Finishing a Development Branch

## Overview

Final verification, present options to human, clean up.

## Process

### Step 1 — Final Verification

Run the full suite one last time:

```bash
echo "No linter configured"        # Must be clean
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit   # Must be clean
echo "No test runner configured"        # All must pass
```

If anything fails → fix before proceeding.

### Step 2 — Review the Diff

```bash
git diff main...HEAD --stat    # Files changed summary
git log main..HEAD --oneline   # Commits in this branch
```

Check:
- [ ] No unintended file changes
- [ ] No debug prints or TODOs
- [ ] No `.env` or secrets committed
- [ ] Commit messages are meaningful

### Step 3 — Present Options to Human

```markdown
## Branch Complete: {branch-name}

### Summary
{2-3 sentences on what was built}

### Changes
- {X} files changed, {Y} insertions, {Z} deletions
- {N} new tests added

### Build Status
- Lint: PASS
- Typecheck: PASS
- Tests: PASS ({total})

### Options
1. **Merge** — `git checkout main && git merge {branch}`
2. **Create PR** — `gh pr create --title "{title}" --body "{body}"`
3. **Keep branch** — Leave as-is for further work
4. **Discard** — `git branch -D {branch}`

Which would you like?
```

### Step 4 — Clean Up (after human chooses)

- If merge/PR: clean up worktree if used
- If discard: delete branch and worktree
- Move all tasks to `tasks/done/`
- Remove worktree: `git worktree remove {path}`
