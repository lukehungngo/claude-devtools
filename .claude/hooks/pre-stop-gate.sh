#!/bin/bash
# Stop hook: Non-blocking quality summary before session ends
# Always exits 0 (non-blocking) — informational only
#
# CUSTOMIZE: Replace LINT_CMD and TEST_CMD with your project's commands

set -euo pipefail

# CUSTOMIZE THESE LINES:
LINT_CMD="pnpm lint --quiet"
TEST_CMD="echo 'No test runner configured'"

LINT_RESULT=$($LINT_CMD 2>&1 || true)
TEST_RESULT=$($TEST_CMD 2>&1 | tail -5 || true)

cat <<EOF
{"systemMessage": "Session Quality Summary:\n\nLint:\n${LINT_RESULT}\n\nTests:\n${TEST_RESULT}"}
EOF

# Always exit 0 — this hook is informational, never blocks
exit 0
