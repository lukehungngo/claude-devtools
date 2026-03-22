---
name: ask-questions
description: Use before starting any non-trivial implementation to clarify underspecified requirements
---

# Ask Questions If Underspecified

## Overview

Before writing any code, ensure the requirement is fully specified. Ambiguity is the #1 source of rework.

## When to Use

- Any new feature request
- Bug reports missing reproduction steps
- Refactoring requests without clear scope
- Any task where you're about to make an assumption

## Process

1. **Read the requirement** — identify every assumption you'd need to make
2. **Categorize gaps:**
   - **Functional:** What should happen? What's the input/output?
   - **Edge cases:** What about nulls, empty strings, large inputs, concurrent access?
   - **Scope:** What's included? What's explicitly NOT included?
   - **Integration:** How does this interact with existing code?
   - **Acceptance:** How do we know it's done?
3. **Ask structured questions** — group by category, prioritize blockers
4. **Wait for answers** — do NOT proceed with assumptions on blockers

## Question Template

```markdown
Before I start, I need to clarify a few things:

### Functional
1. {question about behavior}
2. {question about input/output}

### Scope
3. {what's included vs excluded}

### Edge Cases
4. {question about boundary conditions}

### Acceptance Criteria
5. {how do we verify this is done?}
```

## Anti-patterns

- Starting to code while "waiting for clarification"
- Assuming the most complex interpretation
- Asking too many questions at once (max 5-7 per round)
- Asking questions you could answer by reading the codebase
