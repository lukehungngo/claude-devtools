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
  const patchesById = new Map(patches.map((patch) => [patch.id, patch]));

  return diagnostics.map((diagnostic) => {
    const patch = patchesById.get(diagnostic.id);
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

    if (aiGeneratedFields.length === 0) return diagnostic;
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
