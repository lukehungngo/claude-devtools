import { describe, expect, it } from "vitest";
import { mergeAiDiagnosticCopy } from "../diagnostic-copy.js";
import type { AiDiagnosticCopyPatch } from "../diagnostic-copy.js";
import type { DiagnosticResult } from "../types.js";

function makeDiagnostic(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    id: "tool_failure_storm-diagnostic",
    kind: "proven",
    rank: 1,
    sourcePattern: "tool_failure_storm",
    category: "quality",
    severity: "high",
    confidence: "high",
    title: "Tool failures are slowing delivery",
    summary: "8 of 40 tool calls failed",
    impactLabel: "Quality risk",
    impactValue: "8 failed calls",
    impactDetail: "this period",
    changeThisWeek: "Validate paths before retrying commands.",
    evidenceChips: ["20% failure rate", "8 failed calls"],
    evidenceSessions: [{ id: "s1", detail: "Bash failed repeatedly", cost: 1.2 }],
    evidenceSessionIds: ["s1"],
    whyFlagged: ["8 failed tool calls"],
    aiGeneratedFields: [],
    tellMeMore: {
      whatHappened: "Commands failed repeatedly.",
      whyItMatters: "Repeated failures cost time.",
      recommendedChanges: [
        {
          priority: 1,
          change: "Validate paths before running commands.",
          expectedEffect: "Fewer failed tool calls.",
        },
      ],
    },
    ...overrides,
  };
}

describe("mergeAiDiagnosticCopy", () => {
  it("merges only allowlisted coaching copy fields", () => {
    const diagnostic = makeDiagnostic();
    const patch = {
      id: diagnostic.id,
      title: "Fix failing commands before retrying",
      summary: "Repeated command failures are turning simple work into rework.",
      changeThisWeek: "Check the path and command once before asking Claude to retry.",
      rank: 99,
      confidence: "low",
      impactValue: "$999",
      evidenceSessionIds: ["fake-session"],
      tellMeMore: {
        whatHappened: "Claude retried commands that were already failing.",
        whyItMatters: "The loop burns turns without moving the task forward.",
        recommendedChanges: [
          {
            priority: 1,
            change: "Paste the failing command output into the next request.",
            expectedEffect: "Claude can repair the command instead of guessing.",
          },
        ],
      },
    } as unknown as AiDiagnosticCopyPatch;

    const [merged] = mergeAiDiagnosticCopy([diagnostic], [patch]);

    expect(merged).toMatchObject({
      title: "Fix failing commands before retrying",
      summary: "Repeated command failures are turning simple work into rework.",
      changeThisWeek: "Check the path and command once before asking Claude to retry.",
      rank: 1,
      confidence: "high",
      impactValue: "8 failed calls",
      evidenceSessionIds: ["s1"],
      aiGeneratedFields: [
        "title",
        "summary",
        "changeThisWeek",
        "tellMeMore.whatHappened",
        "tellMeMore.whyItMatters",
        "tellMeMore.recommendedChanges",
      ],
    });
    expect(merged!.tellMeMore.whatHappened).toBe(
      "Claude retried commands that were already failing."
    );
    expect(merged!.tellMeMore.recommendedChanges[0]!.expectedEffect).toBe(
      "Claude can repair the command instead of guessing."
    );
  });

  it("ignores unknown diagnostic IDs and malformed copy fields", () => {
    const diagnostic = makeDiagnostic();
    const patches = [
      { id: "unknown", title: "Should not apply" },
      {
        id: diagnostic.id,
        title: "   ",
        summary: 42,
        tellMeMore: {
          whatHappened: "",
          recommendedChanges: [
            { priority: 1, change: "", expectedEffect: "Missing change should reject list" },
          ],
        },
      },
    ] as unknown as AiDiagnosticCopyPatch[];

    const [merged] = mergeAiDiagnosticCopy([diagnostic], patches);

    expect(merged).toEqual(diagnostic);
  });
});
