---
name: differential-review
description: Use to stress-test a research proposal before committing to implementation
---

# Differential Review

## Overview

Adversarial review of research proposals. The goal is to catch fatal flaws *before* spending time on implementation.

## When to Use

- Before implementing any novel algorithm or approach
- When a research proposal looks "too good to be true"
- When the team has a history of implement-then-discard cycles

## Process

### 1. Read Independently
Read the proposal fresh. You should NOT have been involved in creating it. Independence = no confirmation bias.

### 2. Stress Test — False Positives
- Enumerate 5-10 common patterns that would trigger false positives
- Estimate: "On 100 real projects, how many FPs?"
- Are the proposal's FP estimates realistic or optimistic?

### 3. Stress Test — False Negatives
- Enumerate evasion patterns or edge cases the approach would miss
- Estimate: "What % of real issues would we miss?"
- Does the approach handle indirect/dynamic patterns?

### 4. Feasibility Check
- Is this tractable on real-world codebases (>10K LOC)?
- Does it require information we don't have?
- Can it be implemented in reasonable time?

### 5. Prior Failure Pattern Check
- [ ] Not a heuristic disguised as real detection
- [ ] Not overly optimistic in estimates
- [ ] Not severity-inflated
- [ ] Compliant with honesty-first rules

### 6. Alternative Comparison
- Is there a simpler approach with 80% of the value and 20% of the risk?

### 7. Issue Verdict

| Verdict | When | Effect |
|---------|------|--------|
| **PROCEED** | Sound, realistic | → Implement |
| **REVISE** | Fixable issues (Rounds 1-2) | → Researcher fixes specific points |
| **REJECT** | Fundamentally flawed (Rounds 1-2) | → Researcher pivots approach |
| **ESCALATE** | Round 3, no path forward | → Human decides |

## Output Template

```markdown
## Differential Review: {proposal title}

### Round: {N} of 3

### FP Risk Assessment
{patterns that would false-trigger, estimated rate}

### FN Risk Assessment
{patterns that would be missed, estimated rate}

### Feasibility
{tractable? dependencies? timeline?}

### Prior Failure Patterns
{checklist results}

### Alternative Approaches
{simpler options considered}

### Verdict: {PROCEED/REVISE/REJECT/ESCALATE}
{Rationale in 2-3 sentences}

### Required Changes (if REVISE)
{Numbered list of specific changes}
```
