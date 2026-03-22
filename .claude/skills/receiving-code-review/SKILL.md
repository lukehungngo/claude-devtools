---
name: receiving-code-review
description: Use when processing reviewer feedback to fix issues systematically
---

# Receiving Code Review

## Overview

Process reviewer feedback systematically. Fix by severity. Never argue P3s.

## Process

1. **Read the full review** — don't skim
2. **Categorize by severity:**
   - P0 (fix immediately, blocks merge)
   - P1 (fix immediately, must resolve)
   - P2 (fix or explain with rationale)
   - P3 (note and move on — don't argue)
3. **Fix P0/P1 first** — re-enter TDD cycle for each fix
4. **For P2 disagreements** — explain your rationale clearly, don't silently ignore
5. **After fixing** — re-run full test suite
6. **Re-request review** — submit the fix for re-review

## Anti-patterns

- Cherry-picking which P0/P1 to fix
- Arguing with the reviewer about severity
- Fixing P3s before P0/P1
- Silently ignoring feedback
- Submitting "fixes" without running tests
- Taking feedback personally — it's about the code, not you
