---
name: se-principles
description: Reference when making design decisions or reviewing code architecture
---

# Software Engineering Principles

## Core Design Principles

### SOLID
- **Single Responsibility:** Each module/class does one thing
- **Open/Closed:** Extend via new code, not modifying existing
- **Liskov Substitution:** Subtypes must be substitutable for base types
- **Interface Segregation:** Many specific interfaces > one general interface
- **Dependency Inversion:** Depend on abstractions, not concretions

### Pragmatic Principles
- **YAGNI:** Don't build what isn't needed yet
- **DRY:** No duplicated logic (code or conceptual)
- **KISS:** Simplest solution that works
- **Composition over Inheritance:** Prefer has-a over is-a
- **Fail Fast, Fail Loud:** Errors at the source, not downstream

## Code Quality Checklist

- [ ] Functions do one thing and are named for what they do
- [ ] No function longer than ~30 lines
- [ ] No more than 3 parameters per function
- [ ] Error handling is explicit (no swallowed errors)
- [ ] Dependencies are injected, not hard-coded
- [ ] Public interfaces are minimal and well-documented
- [ ] Tests test behavior, not implementation

## When Principles Conflict

Principles sometimes conflict. Resolution order:
1. **Correctness** > everything else
2. **Simplicity** > cleverness
3. **Readability** > conciseness
4. **Explicit** > implicit
5. **Tested** > untested

## Design Smell Checklist

| Smell | Symptom | Fix |
|-------|---------|-----|
| God object | One class does everything | Split by responsibility |
| Feature envy | Method uses another class's data more than its own | Move method |
| Shotgun surgery | One change requires touching many files | Extract shared module |
| Primitive obsession | Using strings/ints where a type would be clearer | Create domain types |
| Long parameter list | Function takes 5+ params | Create parameter object |
