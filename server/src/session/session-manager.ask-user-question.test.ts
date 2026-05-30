import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionManager } from "../session/session-manager.js";
import { clearSessionAllowances } from "../hooks/permission-handler.js";

// Audit S3 (P1) — AskUserQuestion bridge.
//
// The SDK surfaces an interactive AskUserQuestion as a `canUseTool` ask
// (sdk.d.ts:188-230, :3365). The bridge must:
//   1. register a resolver in questionResolvers keyed by a question id,
//   2. broadcast { type:"user-question", question:{ id, sessionId, questionText, status } }
//      matching WsUserQuestionMessage (types.ts:810-818) and the client's
//      useUnifiedWebSocket.ts:100 / AppLayout.tsx:176 contract,
//   3. resolve the canUseTool promise with the user's answer fed back to the
//      SDK so the agent continues (PermissionResult, sdk.d.ts:1997-2009).
//
// We exercise handleQuestion via the same private-method bracket-notation
// convention used by the existing handlePermission tests.

describe("SessionManager — AskUserQuestion bridge (S3)", () => {
  let manager: SessionManager;
  const makeBroadcast = () => {
    const calls: unknown[] = [];
    const fn = (data: unknown): void => { calls.push(data); };
    return { fn, calls };
  };
  let broadcast: ReturnType<typeof makeBroadcast>;

  beforeEach(() => {
    broadcast = makeBroadcast();
    manager = new SessionManager(broadcast.fn);
    clearSessionAllowances();
  });

  afterEach(() => {
    manager.dispose();
  });

  const askInput = {
    questions: [
      {
        question: "Which library should we use for date formatting?",
        header: "Library",
        options: [
          { label: "date-fns", description: "Tree-shakeable" },
          { label: "dayjs", description: "Tiny" },
        ],
        multiSelect: false,
      },
    ],
  };

  it("registers a pending question and broadcasts user-question when an AskUserQuestion ask arrives", async () => {
    const id = await manager.startSession("/tmp");
    const session = manager.getStatus(id)!;
    session.status = "streaming";
    broadcast.calls.length = 0;

    // Fire-and-do-not-await: handleQuestion blocks on the resolver.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (manager as any)["handleQuestion"](session, askInput, { toolUseID: "tu-q1" });

    const questionBroadcasts = broadcast.calls.filter(
      (c) => (c as Record<string, unknown>).type === "user-question"
    );
    expect(questionBroadcasts).toHaveLength(1);
    const payload = questionBroadcasts[0] as Record<string, unknown>;
    const question = payload.question as Record<string, unknown>;
    expect(question.sessionId).toBe(id);
    expect(question.questionText).toBe("Which library should we use for date formatting?");
    expect(question.status).toBe("pending");
    expect(typeof question.id).toBe("string");

    // getPendingQuestions() reflects the registered question.
    const pending = manager.getPendingQuestions();
    expect(pending).toContainEqual({ questionId: question.id, sessionId: id });

    // Clean up: resolve to avoid the 10-min timeout leak.
    manager.resolveQuestion(question.id as string, "date-fns");
    await promise;
  });

  it("resolveQuestion feeds the answer back to the SDK via the canUseTool result", async () => {
    const id = await manager.startSession("/tmp");
    const session = manager.getStatus(id)!;
    session.status = "streaming";
    broadcast.calls.length = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (manager as any)["handleQuestion"](session, askInput, { toolUseID: "tu-q2" });

    const question = (
      broadcast.calls.find((c) => (c as Record<string, unknown>).type === "user-question") as Record<string, unknown>
    ).question as Record<string, unknown>;

    const resolved = manager.resolveQuestion(question.id as string, "date-fns");
    expect(resolved).toBe(true);

    // F1: the canUseTool promise must settle with the ANSWER channel — the
    // `allow` variant carrying updatedInput.answers keyed by the question text
    // (Anthropic Agent SDK "Handle clarifying questions"; PermissionResultAllow
    // .updatedInput exists in sdk.d.ts ~1999). A `deny` would make the model
    // perceive its question as REFUSED.
    const result = (await promise) as {
      behavior: string;
      updatedInput?: { questions?: unknown; answers?: Record<string, unknown> };
    };
    expect(result.behavior).toBe("allow");
    expect(result.updatedInput?.answers).toEqual({
      "Which library should we use for date formatting?": "date-fns",
    });
    // The original questions array is echoed back alongside the answers.
    expect(result.updatedInput?.questions).toEqual(askInput.questions);
  });

  it("removes the resolver after the question is answered", async () => {
    const id = await manager.startSession("/tmp");
    const session = manager.getStatus(id)!;
    session.status = "streaming";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (manager as any)["handleQuestion"](session, askInput, { toolUseID: "tu-q3" });
    const question = (
      broadcast.calls.find((c) => (c as Record<string, unknown>).type === "user-question") as Record<string, unknown>
    ).question as Record<string, unknown>;

    manager.resolveQuestion(question.id as string, "dayjs");
    await promise;

    expect(session.questionResolvers.has(question.id as string)).toBe(false);
    expect(manager.getPendingQuestions()).not.toContainEqual({ questionId: question.id, sessionId: id });
  });
});
