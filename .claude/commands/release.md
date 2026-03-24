---
description: Release checklist — verify tests, changelog, tag, and publish
---

# Release Checklist

Prepare a release for: $ARGUMENTS

## Community Release Gate

Before releasing to the community, verify `docs/testing/workflow-routing.md`:

- [ ] ≥ 10 real-world sessions logged
- [ ] Accuracy ≥ 80% (correct + partial / total)
- [ ] All `NO` rows have a root cause and fix documented in the Failure Patterns table

**If gate is not met — stop. Do not release to community until testing is complete.**

---

## Pre-Release Checks

Run ALL of these. Any failure blocks the release.

```bash
# 1. Tests
cd server && pnpm test && cd ../dashboard && pnpm test

# 2. Lint
pnpm lint

# 3. Type check
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit

# 4. Build
make build
```

## Security Checks

- [ ] No `.env` files or secrets in the repo
- [ ] No hardcoded credentials
- [ ] Dependencies are up to date (`{{dependency-audit-command}}`)
- [ ] No known vulnerabilities in dependencies

## Documentation

- [ ] README is up to date
- [ ] CHANGELOG has entry for this version
- [ ] API docs are current (if applicable)

## Version Bump

```bash
# Update version in {{version-file}} (e.g., pyproject.toml, package.json)
# Follow semver: MAJOR.MINOR.PATCH
```

## Release

```bash
# Create tag
git tag -a v{{version}} -m "Release v{{version}}"

# Push
git push origin main --tags

# Publish (customize for your ecosystem)
# Python: hatch build && hatch publish
# Node: npm publish
# Go: (tags are the release)
```

## Post-Release

- [ ] Verify package is available (pip install / npm install)
- [ ] Create GitHub release with changelog
- [ ] Notify team
