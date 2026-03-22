# How to Write New Rules

## Purpose

Guidelines for creating and maintaining rules in `.claude/rules/`. Rules are always-loaded context that Claude reads every session.

## When to Create a Rule

Create a new rule when:
1. **A mistake was made that a rule would have prevented** (P0 lesson)
2. **A domain-specific pattern needs to be always-loaded knowledge** (e.g., framework gotchas)
3. **An architecture invariant needs enforcement** beyond CLAUDE.md

## Rule Format

Every rule file MUST follow this structure:

```markdown
# {Rule Name}

## Purpose
{One sentence: what does this rule prevent or enforce?}

## The Rule
{Clear, actionable statements. Use imperative mood.}

## Examples
{Good example vs bad example, or concrete scenarios}

## P0 Lessons (if applicable)
{Date + what happened + what this rule prevents}
```

## Naming Convention

- `{domain}-{topic}.md` — e.g., `api-versioning.md`, `db-migrations.md`
- Use kebab-case
- Keep names under 30 characters
- Prefix domain-specific rules with the domain

## When NOT to Create a Rule

- **One-time project knowledge** → put in CLAUDE.md
- **Temporary workarounds** → put in CLAUDE.md with a TODO to remove
- **Style preferences** → put in linter config, not rules
- **General programming advice** → use the `se-principles` skill instead

## Rule Evolution

- Rules are living documents — update when lessons are learned
- Add P0 Lessons section when a rule fails to prevent an issue
- Remove rules that are no longer relevant
- Review rules quarterly
- Never delete P0 Lessons (they're historical record)

## When the System Changes, Update Rules

| Change | Action |
|--------|--------|
| New architecture invariant | Add to `architecture.md` AND `CLAUDE.md` |
| New domain knowledge | Create `{domain}-patterns.md` in rules/ |
| P0 incident | Add P0 Lesson to relevant rule, or create new rule |
| Deprecated pattern | Update rule with "DEPRECATED" section, don't delete |
| New framework/dependency | Create `{framework}.md` with gotchas and patterns |
| Rule no longer applies | Add "DEPRECATED: {reason}" header, remove after 1 quarter |
