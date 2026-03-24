---
name: systematic-debugging
description: Use when a bug's root cause is unclear after initial investigation
---

# Systematic Debugging

> If interrupted, re-invoke with the same arguments — this skill is idempotent.

## Overview

When a bug's root cause isn't obvious, follow a systematic process instead of random poking.

## Process

### 1. Reproduce
Write a minimal failing test that exposes the bug. If you can't reproduce it, you can't fix it.

### 2. Bisect
Narrow down where the bug was introduced:
- `git bisect` for regression bugs
- Binary search through the code path for logic bugs
- Add logging at midpoints to narrow the scope

### 3. Trace
Follow data flow from input to failure point:
- What's the input?
- What's the expected output vs actual output?
- Where does the data diverge from expectations?

### 4. Hypothesize
Form exactly ONE hypothesis. Test it with a targeted experiment:
- If confirmed → you found the bug
- If refuted → form a new hypothesis
- Never test multiple hypotheses at once

### 5. Fix
- Minimal fix — don't refactor while debugging
- Verify with the failing test from Step 1

### 6. Prevent
- Add regression test (the one from Step 1)
- If this is a new pattern, add a rule to `.claude/rules/`
- If it's a known pattern, update the relevant rule

## Anti-patterns

- "Let me try random things and see what happens"
- Fixing the symptom instead of the root cause
- Debugging without a reproduction case
- Changing multiple things at once
- Not writing a regression test after fixing

## Root Cause Categories

| Category | Example | Fix Pattern |
|----------|---------|-------------|
| Logic error | Off-by-one, wrong comparison | Fix condition, add edge case test |
| State bug | Race condition, stale cache | Fix synchronization or invalidation |
| Type error | Null where non-null expected | Add validation, fix type |
| Integration | API changed, wrong format | Update adapter, add contract test |
| Config | Wrong env var, missing setting | Fix config, add validation |
