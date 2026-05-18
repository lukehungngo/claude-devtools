# Hybrid AI Coaching Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production slice of hybrid AI coaching diagnostics by making proven diagnostics explicit and limiting future AI influence to validated coaching copy fields.

**Architecture:** Deterministic detectors continue to produce diagnostics. A new merge helper accepts AI copy patches keyed by diagnostic ID, validates the patch shape, and copies only allowlisted text fields onto server-owned diagnostics. The UI receives the same diagnostics shape plus `kind` and `aiGeneratedFields`.

**Tech Stack:** TypeScript, Vitest, Express server analyzer code, React dashboard mirrored types.

---

## Files

- Modify: `server/src/analyzer/efficiency/types.ts`
  - Add `DiagnosticKind`.
  - Add `kind` and `aiGeneratedFields` to `DiagnosticResult`.
- Modify: `dashboard/src/lib/insightsDiagnosticsTypes.ts`
  - Mirror `DiagnosticKind`, `kind`, and `aiGeneratedFields`.
- Modify: `server/src/analyzer/efficiency/hint-ranker.ts`
  - Mark deterministic diagnostics as `kind: "proven"`.
  - Set `aiGeneratedFields: []`.
- Create: `server/src/analyzer/efficiency/diagnostic-copy.ts`
  - Define `AiDiagnosticCopyPatch`.
  - Implement `mergeAiDiagnosticCopy`.
- Create: `server/src/analyzer/efficiency/__tests__/diagnostic-copy.test.ts`
  - Prove AI copy can update allowed text fields only.
  - Prove detector-owned fields cannot be changed.
  - Prove unknown IDs and malformed copy are ignored.
- Modify: `server/src/analyzer/efficiency/__tests__/hint-ranker.test.ts`
  - Assert deterministic diagnostics are `kind: "proven"` and have no AI-generated fields.

## Task 1: Mark Deterministic Diagnostics As Proven

- [ ] Write a failing assertion in `server/src/analyzer/efficiency/__tests__/hint-ranker.test.ts`:

```ts
expect(diagnostics[0]).toMatchObject({
  id: "edit_rejection_rate-diagnostic",
  rank: 1,
  sourcePattern: "edit_rejection_rate",
  kind: "proven",
  aiGeneratedFields: [],
  evidenceChips: ["chip"],
});
```

- [ ] Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/hint-ranker.test.ts
```

Expected: fail because `kind` and `aiGeneratedFields` are missing.

- [ ] Update `server/src/analyzer/efficiency/types.ts`:

```ts
export type DiagnosticKind = "proven" | "observation";
```

Add to `DiagnosticResult`:

```ts
kind: DiagnosticKind;
aiGeneratedFields: string[];
```

- [ ] Update `dashboard/src/lib/insightsDiagnosticsTypes.ts` with the same `DiagnosticKind` and fields.

- [ ] Update `buildDiagnostics` in `server/src/analyzer/efficiency/hint-ranker.ts`:

```ts
kind: "proven",
aiGeneratedFields: [],
```

- [ ] Run the focused test again and expect pass.

## Task 2: Add AI Copy Merge Helper

- [ ] Create `server/src/analyzer/efficiency/__tests__/diagnostic-copy.test.ts` with tests that assert:
  - allowed copy fields can change
  - detector-owned fields such as `rank`, `confidence`, `impactValue`, and `evidenceSessionIds` cannot change
  - unknown diagnostic IDs are ignored
  - `aiGeneratedFields` lists only changed AI copy fields

- [ ] Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/diagnostic-copy.test.ts
```

Expected: fail because `diagnostic-copy.ts` does not exist.

- [ ] Create `server/src/analyzer/efficiency/diagnostic-copy.ts`:

```ts
import type { DiagnosticResult } from "./types.js";

export interface AiRecommendedChangePatch {
  priority: number;
  change: string;
  expectedEffect: string;
}

export interface AiDiagnosticCopyPatch {
  id: string;
  title?: string;
  summary?: string;
  changeThisWeek?: string;
  tellMeMore?: {
    whatHappened?: string;
    whyItMatters?: string;
    recommendedChanges?: AiRecommendedChangePatch[];
  };
}

export function mergeAiDiagnosticCopy(
  diagnostics: DiagnosticResult[],
  patches: AiDiagnosticCopyPatch[]
): DiagnosticResult[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return diagnostics.map((diagnostic) => {
    const patch = byId.get(diagnostic.id);
    if (!patch) return diagnostic;

    const aiGeneratedFields: string[] = [];
    const next: DiagnosticResult = {
      ...diagnostic,
      tellMeMore: { ...diagnostic.tellMeMore },
      aiGeneratedFields: [],
    };

    if (isNonEmptyText(patch.title)) {
      next.title = patch.title.trim();
      aiGeneratedFields.push("title");
    }
    if (isNonEmptyText(patch.summary)) {
      next.summary = patch.summary.trim();
      aiGeneratedFields.push("summary");
    }
    if (isNonEmptyText(patch.changeThisWeek)) {
      next.changeThisWeek = patch.changeThisWeek.trim();
      aiGeneratedFields.push("changeThisWeek");
    }
    if (isNonEmptyText(patch.tellMeMore?.whatHappened)) {
      next.tellMeMore.whatHappened = patch.tellMeMore.whatHappened.trim();
      aiGeneratedFields.push("tellMeMore.whatHappened");
    }
    if (isNonEmptyText(patch.tellMeMore?.whyItMatters)) {
      next.tellMeMore.whyItMatters = patch.tellMeMore.whyItMatters.trim();
      aiGeneratedFields.push("tellMeMore.whyItMatters");
    }
    if (isRecommendedChanges(patch.tellMeMore?.recommendedChanges)) {
      next.tellMeMore.recommendedChanges = patch.tellMeMore.recommendedChanges.map((item) => ({
        priority: item.priority,
        change: item.change.trim(),
        expectedEffect: item.expectedEffect.trim(),
      }));
      aiGeneratedFields.push("tellMeMore.recommendedChanges");
    }

    next.aiGeneratedFields = aiGeneratedFields;
    return next;
  });
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecommendedChanges(value: unknown): value is AiRecommendedChangePatch[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => (
      typeof item === "object"
      && item !== null
      && Number.isFinite((item as AiRecommendedChangePatch).priority)
      && isNonEmptyText((item as AiRecommendedChangePatch).change)
      && isNonEmptyText((item as AiRecommendedChangePatch).expectedEffect)
    ));
}
```

- [ ] Run the focused merge-helper test and expect pass.

## Task 3: Verification

- [ ] Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/hint-ranker.test.ts src/analyzer/efficiency/__tests__/diagnostic-copy.test.ts
pnpm -C server build
pnpm -C dashboard test src/components/insights/__tests__/DiagnosticsSection.test.tsx src/routes/InsightsPage.test.tsx
pnpm -C dashboard build
```

Expected:
- server focused tests pass
- server build passes
- dashboard focused tests pass
- dashboard build passes

- [ ] Restore generated build artifacts if needed:

```bash
git restore server/dist
rm -rf dashboard/dist
```
