#!/bin/bash
# PostToolUse hook: Fast lint after file edits
# Triggered on: Edit, Write tool uses
#
# CUSTOMIZE: Replace the LINT_CMD with your project's linter
# Examples:
#   Python:     "ruff check src/ tests/"
#   TypeScript: "eslint src/ --quiet"
#   Go:         "golangci-lint run ./..."

set -euo pipefail

LINT_CMD="pnpm lint --quiet"

# Only lint if source files were recently changed
if git diff --name-only HEAD 2>/dev/null | grep -qE '\.(py|ts|js|tsx|jsx|go|rs)$'; then
  $LINT_CMD 2>&1 || true
fi
