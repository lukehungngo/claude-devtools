#!/bin/bash
# Stop hook: Validate that the MAS pipeline actually ran

set -euo pipefail

RESULTS=$( (ls docs/results/TASK-*-result.md 2>/dev/null || true) | wc -l | tr -d ' ')
REVIEWS=$( (ls docs/reports/TASK-*-review.md 2>/dev/null || true) | wc -l | tr -d ' ')

if [ "$RESULTS" = "0" ] && [ "$REVIEWS" = "0" ]; then
  exit 0
fi

REFLECT=$( (ls docs/reports/reflect-report.md 2>/dev/null || true) | wc -l | tr -d ' ')
SELF_REVIEWS=$( (ls docs/results/TASK-*-self-review.md 2>/dev/null || true) | wc -l | tr -d ' ')

WARNINGS=""

if [ "$RESULTS" = "0" ]; then
  WARNINGS="${WARNINGS}\n  ⚠ No engineer results found"
fi
if [ "$REVIEWS" = "0" ]; then
  WARNINGS="${WARNINGS}\n  ⚠ No review reports found"
fi
if [ "$REFLECT" = "0" ]; then
  WARNINGS="${WARNINGS}\n  ⚠ No reflect report found"
fi

SENTINEL="docs/reports/.reflect-skipped"
if [ -f "$SENTINEL" ]; then
  REASON=$(head -1 "$SENTINEL" | tr -d '\n')
  if [ -n "$REASON" ]; then
    cat <<EOF
{"systemMessage": "Pipeline Validation: reflect skipped (intentional).\n  Reason: ${REASON}"}
EOF
    exit 0
  fi
fi

if [ "$RESULTS" != "0" ] && [ "$REVIEWS" != "0" ] && [ "$REFLECT" = "0" ]; then
  cat >&2 <<EOF
Pipeline Validation BLOCKED:
  Results: ${RESULTS}, Reviews: ${REVIEWS}, Reflect: MISSING

  A full pipeline ran but reflect was never dispatched.
  Run: Agent(subagent_type: 'mas:reflect-agent:reflect-agent', ...)
  Or skip: echo "reason" > docs/reports/.reflect-skipped
EOF
  exit 2
fi

if [ -n "$WARNINGS" ]; then
  cat <<EOF
{"systemMessage": "Pipeline Validation:\n  Results: ${RESULTS}, Reviews: ${REVIEWS}, Reflect: ${REFLECT}${WARNINGS}"}
EOF
fi

exit 0
