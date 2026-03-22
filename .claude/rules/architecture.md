# Architecture Invariants

## Purpose

Define non-negotiable architecture rules. Violating any of these is a P0.

## Invariants

<!-- CUSTOMIZE: Replace these with YOUR project's invariants -->

1. **{{Invariant 1}}** — {{Why. What happens if violated.}}
2. **{{Invariant 2}}** — {{Why. What happens if violated.}}
3. **{{Invariant 3}}** — {{Why. What happens if violated.}}

## Examples from Real Projects

Use these as inspiration for defining your own:

- **"Never execute user code."** (Security scanner) — All analysis via AST only. Running user code is a critical vulnerability.
- **"Static by default."** (CLI tool) — No network calls unless explicit flag is passed.
- **"Fail safe."** (Any tool) — Parse error on input → warning + skip. Never crash the entire operation.
- **"No direct database access from controllers."** (Web app) — All DB access through repository layer.
- **"All API responses are typed."** (API server) — Every endpoint has a response schema. No `any` types.

## How to Add New Invariants

1. Write the invariant as a clear, imperative statement
2. Explain WHY it matters (what breaks if violated)
3. Add it to this file AND to `CLAUDE.md`'s Architecture Invariants section
4. If an invariant was learned from a failure, add a P0 Lesson

## P0 Lessons

<!-- Add lessons here. Format:
### YYYY-MM-DD: {Title}
{What happened when invariant was violated. What this prevents.}
-->
