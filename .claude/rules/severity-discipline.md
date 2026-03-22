# Severity Discipline

## Purpose

Prevent severity inflation. Inflated severity kills user trust and makes real critical issues invisible.

## Classification Rules

| Level | Definition | Example |
|-------|-----------|---------|
| **CRITICAL / P0** | Confirmed exploitable issue, data loss, security breach | SQL injection with proof, auth bypass |
| **HIGH / P1** | Likely issue with clear evidence, wrong edge case | Missing null check on user input, race condition |
| **MEDIUM / P2** | Potential issue, needs investigation, design flaw | Poor error handling, missing validation |
| **LOW / P3** | Style, suggestions, minor cleanup | Naming, formatting, minor refactor |

## Rules

1. **CRITICAL/P0 is reserved for confirmed, exploitable issues.** "Could theoretically be a problem" is not CRITICAL.
2. **When in doubt, go one level lower.** CRITICAL → HIGH, HIGH → MEDIUM.
3. **Evidence required for CRITICAL/P0:** You must be able to describe the exact scenario that causes harm.
4. **Don't inflate to get attention.** If everything is P0, nothing is P0.

## Anti-patterns

- Marking style issues as P1 to force compliance
- Using CRITICAL for "I feel strongly about this"
- Downgrading real P0s to avoid conflict
- Inconsistent severity across similar issues
