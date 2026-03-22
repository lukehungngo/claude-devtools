---
name: property-based-testing
description: Use for edge-case-heavy code where enumerated test cases are insufficient
---

# Property-Based Testing

## Overview

Instead of testing specific examples, test properties that must hold for ALL valid inputs. The framework generates hundreds of random inputs to find edge cases you'd never think of.

## When to Use

- Parsing, serialization, data transformation
- Any function with a large input space
- Codec/encoder/decoder pairs (roundtrip property)
- Mathematical/financial calculations
- Code where "works for my examples" isn't good enough

## Libraries

| Language | Library |
|----------|---------|
| Python | `hypothesis` |
| TypeScript/JS | `fast-check` |
| Go | `gopter` or `rapid` |
| Rust | `proptest` |

## Process

### 1. Identify Properties

Properties are invariants that hold for ALL valid inputs:

| Property Type | Example |
|--------------|---------|
| **Roundtrip** | `decode(encode(x)) == x` |
| **Idempotent** | `sort(sort(x)) == sort(x)` |
| **Invariant** | `len(filter(xs)) <= len(xs)` |
| **Commutative** | `merge(a, b) == merge(b, a)` |
| **Oracle** | `fast_impl(x) == slow_reference_impl(x)` |

### 2. Write Generators

Define the input domain — what are valid inputs?

```python
# Python + Hypothesis example
from hypothesis import given
from hypothesis import strategies as st

@given(st.text(), st.text())
def test_concat_length(a, b):
    assert len(a + b) == len(a) + len(b)
```

### 3. Run with High Count

Run with 200+ examples minimum. Property-based tests find bugs through volume.

### 4. Shrink Failures

When a failure is found, the library automatically shrinks to the minimal failing case. Use this minimal case as your regression test.

## Anti-patterns

- Using property tests as a replacement for unit tests (they complement, not replace)
- Too-weak properties that pass trivially
- Overly constrained generators that miss edge cases
- Not adding shrunk failures as regression tests
