import { describe, it, expect, beforeEach } from "vitest";
import {
  mapSdkMessageToSSEEvents,
  __resetPreCompactBufferForTest,
  __setPreCompactBufferTtlForTest,
  PRE_COMPACT_BUFFER_DEFAULT_TTL_MS,
} from "./sse-event-handler.js";

describe("mapSdkMessageToSSEEvents", () => {
  describe("stream_event: content_block_delta", () => {
    it("maps text_delta to stdout event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello world" },
          index: 0,
        },
      });
      expect(result).toEqual([{ type: "stdout", text: "Hello world" }]);
    });

    it("maps thinking_delta to thinking event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "Let me think..." },
          index: 0,
        },
      });
      expect(result).toEqual([{ type: "thinking", text: "Let me think..." }]);
    });

    it("maps input_json_delta to tool_delta event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"file_path":' },
          index: 0,
        },
      });
      expect(result).toEqual([
        { type: "tool_delta", partial_json: '{"file_path":' },
      ]);
    });

    it("ignores text_delta with empty text", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "" },
          index: 0,
        },
      });
      expect(result).toEqual([]);
    });
  });

  describe("stream_event: content_block_start", () => {
    it("maps tool_use content_block_start to tool_start event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "toolu_123",
            name: "Read",
            input: {},
          },
          index: 1,
        },
      });
      expect(result).toEqual([
        { type: "tool_start", id: "toolu_123", name: "Read", input: {} },
      ]);
    });

    it("ignores non-tool_use content_block_start", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "text", text: "" },
          index: 0,
        },
      });
      expect(result).toEqual([]);
    });
  });

  describe("stream_event: content_block_stop", () => {
    it("maps content_block_stop to tool_end event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
        event: { type: "content_block_stop", index: 2 },
      });
      expect(result).toEqual([{ type: "tool_end", index: 2 }]);
    });
  });

  describe("assistant message", () => {
    it("extracts text blocks from assistant message content", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Here is my analysis." },
            { type: "tool_use", id: "t1", name: "Read", input: {} },
          ],
        },
      });
      expect(result).toEqual([
        { type: "stdout", text: "Here is my analysis." },
      ]);
    });

    it("returns empty for assistant message with no text blocks", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
        },
      });
      expect(result).toEqual([]);
    });
  });

  describe("user message (tool results)", () => {
    it("extracts tool_result blocks", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_123",
              content: "file contents here",
              is_error: false,
            },
          ],
        },
      });
      expect(result).toEqual([
        {
          type: "tool_result",
          tool_use_id: "toolu_123",
          content: "file contents here",
          is_error: false,
        },
      ]);
    });

    it("extracts tool_result with is_error true", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_456",
              content: "No such file",
              is_error: true,
            },
          ],
        },
      });
      expect(result).toEqual([
        {
          type: "tool_result",
          tool_use_id: "toolu_456",
          content: "No such file",
          is_error: true,
        },
      ]);
    });

    it("ignores non-tool_result content in user messages", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "user",
        message: {
          content: [{ type: "text", text: "user prompt" }],
        },
      });
      expect(result).toEqual([]);
    });
  });

  describe("tool_progress", () => {
    it("maps tool_progress message", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "tool_progress",
        tool_use_id: "toolu_789",
        tool_name: "Bash",
        elapsed_time_seconds: 5.2,
      });
      expect(result).toEqual([
        {
          type: "tool_progress",
          tool_use_id: "toolu_789",
          tool_name: "Bash",
          elapsed_time_seconds: 5.2,
        },
      ]);
    });
  });

  describe("system messages", () => {
    it("maps status message", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "status",
        status: "compacting",
      });
      expect(result).toEqual([{ type: "status", status: "compacting" }]);
    });

    it("maps compact_boundary message (snake_case fallback for legacy SDK)", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 50000 },
      });
      expect(result).toEqual([
        {
          type: "compact",
          metadata: {
            trigger: "auto",
            preTokens: 50000,
            postTokens: undefined,
            durationMs: undefined,
            preCompactDiscoveredTools: undefined,
          },
        },
      ]);
    });

    it("maps compact_boundary with camelCase compactMetadata (real CC JSONL shape)", () => {
      // Real CC v2.1.143 shape captured from ~/.claude/projects/*.jsonl
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: {
          trigger: "auto",
          preTokens: 168470,
          postTokens: 8759,
          durationMs: 60791,
          preCompactDiscoveredTools: ["Read", "Write"],
          preservedSegment: { headUuid: "h1", anchorUuid: "a1", tailUuid: "t1" },
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "compact",
        metadata: {
          trigger: "auto",
          preTokens: 168470,
          postTokens: 8759,
          durationMs: 60791,
        },
      });
    });

    it("maps compact_boundary manual trigger", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "manual", preTokens: 100000, postTokens: 5000, durationMs: 30000 },
      });
      expect(result[0]).toMatchObject({
        type: "compact",
        metadata: { trigger: "manual" },
      });
    });

    it("maps system init to init event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "init",
        tools: ["Read", "Write"],
        model: "claude-sonnet-4-20250514",
        cwd: "/tmp/project",
      });
      expect(result).toEqual([
        {
          type: "init",
          tools: ["Read", "Write"],
          model: "claude-sonnet-4-20250514",
          cwd: "/tmp/project",
        },
      ]);
    });

    it("maps system task_started to task_started event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "task_started",
        taskId: "task-1",
        description: "Running build",
      });
      expect(result).toEqual([
        { type: "task_started", taskId: "task-1", description: "Running build" },
      ]);
    });

    it("maps system task_progress to task_progress event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "task_progress",
        taskId: "task-1",
        progress: 50,
      });
      expect(result).toEqual([
        { type: "task_progress", taskId: "task-1", progress: 50 },
      ]);
    });

    it("maps system task_notification to task_notification event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "task_notification",
        taskId: "task-1",
        message: "Build complete",
      });
      expect(result).toEqual([
        { type: "task_notification", taskId: "task-1", message: "Build complete" },
      ]);
    });

    it("maps system hook_started to hook_started event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "hook_started",
        hookName: "pre-commit",
        hookId: "h-1",
      });
      expect(result).toEqual([
        { type: "hook_started", hookName: "pre-commit", hookId: "h-1" },
      ]);
    });

    it("maps system hook_progress to hook_progress event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "hook_progress",
        hookId: "h-1",
        output: "linting...",
      });
      expect(result).toEqual([
        { type: "hook_progress", hookId: "h-1", output: "linting..." },
      ]);
    });

    it("maps system hook_response to hook_response event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "hook_response",
        hookId: "h-1",
        exitCode: 0,
      });
      expect(result).toEqual([
        { type: "hook_response", hookId: "h-1", exitCode: 0 },
      ]);
    });

    it("ignores unknown system subtypes", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "some_unknown_subtype",
      });
      expect(result).toEqual([]);
    });
  });

  describe("result message", () => {
    it("maps success result", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0.05,
        duration_ms: 12000,
        num_turns: 3,
        result: "Done!",
      });
      expect(result).toEqual([
        {
          type: "result",
          is_error: false,
          subtype: "success",
          total_cost_usd: 0.05,
          duration_ms: 12000,
          num_turns: 3,
          result: "Done!",
        },
      ]);
    });

    it("forwards OTel stop_reason and nested gen_ai.response.finish_reasons (P2-5)", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0.05,
        duration_ms: 12000,
        num_turns: 3,
        result: "Done!",
        stop_reason: "end_turn",
        gen_ai: { response: { finish_reasons: ["stop"] } },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "result",
        is_error: false,
        stop_reason: "end_turn",
        finish_reasons: ["stop"],
      });
    });

    it("omits OTel fields when absent and does not crash (P2-5)", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0.01,
        duration_ms: 100,
        num_turns: 1,
        result: "ok",
      });
      expect(result).toHaveLength(1);
      const evt = result[0] as { stop_reason?: string; finish_reasons?: string[] };
      expect(evt.stop_reason).toBeUndefined();
      expect(evt.finish_reasons).toBeUndefined();
    });

    it("maps error result with errors array", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        total_cost_usd: 0.02,
        duration_ms: 5000,
        num_turns: 1,
        errors: ["Rate limit exceeded"],
      });
      expect(result).toEqual([
        {
          type: "result",
          is_error: true,
          subtype: "error_during_execution",
          total_cost_usd: 0.02,
          duration_ms: 5000,
          num_turns: 1,
          errors: ["Rate limit exceeded"],
        },
      ]);
    });
  });

  describe("tool_use_summary", () => {
    it("maps tool_use_summary to tool_summary event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "tool_use_summary",
        tool_use_id: "toolu_abc",
        tool_name: "Bash",
        summary: "Ran npm test",
      });
      expect(result).toEqual([
        {
          type: "tool_summary",
          tool_use_id: "toolu_abc",
          tool_name: "Bash",
          summary: "Ran npm test",
        },
      ]);
    });
  });

  describe("rate_limit_event", () => {
    it("maps rate_limit_event to rate_limit event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "rate_limit_event",
        retry_after_seconds: 30,
        message: "Rate limited",
      });
      expect(result).toEqual([
        {
          type: "rate_limit",
          retry_after_seconds: 30,
          message: "Rate limited",
        },
      ]);
    });
  });

  describe("prompt_suggestion", () => {
    it("maps prompt_suggestion to prompt_suggestion event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "prompt_suggestion",
        suggestions: ["Fix the bug", "Add tests"],
      });
      expect(result).toEqual([
        {
          type: "prompt_suggestion",
          suggestions: ["Fix the bug", "Add tests"],
        },
      ]);
    });
  });

  describe("local_command_output", () => {
    it("maps local_command_output to command_output event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "local_command_output",
        command: "npm test",
        output: "All tests passed",
        exitCode: 0,
      });
      expect(result).toEqual([
        {
          type: "command_output",
          command: "npm test",
          output: "All tests passed",
          exitCode: 0,
        },
      ]);
    });
  });

  describe("unknown message types", () => {
    it("returns empty array for unknown types", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "keep_alive",
      });
      expect(result).toEqual([]);
    });

    it("returns empty for stream_event with no event", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "stream_event",
      });
      expect(result).toEqual([]);
    });
  });

  describe("PreCompact hook attribution on compact events (P2-9)", () => {
    beforeEach(() => {
      __resetPreCompactBufferForTest();
      __setPreCompactBufferTtlForTest(PRE_COMPACT_BUFFER_DEFAULT_TTL_MS);
    });

    it("does not emit SSE events for attachment messages", () => {
      const out = mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "check-rotate.sh",
          hookEvent: "PreCompact",
          command: "check-rotate.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 12,
        },
      });
      expect(out).toEqual([]);
    });

    it("attributes compact_boundary to the most recent PreCompact hook_success", () => {
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "check-rotate.sh",
          hookEvent: "PreCompact",
          command: "check-rotate.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 12,
        },
      });

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: {
          trigger: "auto",
          preTokens: 168470,
          postTokens: 8759,
          durationMs: 60791,
        },
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        type: "compact",
        metadata: {
          trigger: "auto",
          attributedTo: { hookName: "check-rotate.sh" },
        },
      });
      const attribution = (out[0] as {
        metadata: { attributedTo?: { cancelled?: boolean } };
      }).metadata.attributedTo;
      expect(attribution?.cancelled).toBeUndefined();
    });

    it("attributes compact_boundary to PreCompact hook_cancelled with reason", () => {
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_cancelled",
          hookName: "guard-precompact.sh",
          hookEvent: "PreCompact",
          reason: "context still warm",
        },
      });

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        type: "compact",
        metadata: {
          attributedTo: {
            hookName: "guard-precompact.sh",
            cancelled: true,
            reason: "context still warm",
          },
        },
      });
    });

    it("leaves attributedTo undefined when no recent PreCompact attachment exists", () => {
      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      expect(out).toHaveLength(1);
      const meta = (out[0] as { metadata: { attributedTo?: unknown } }).metadata;
      expect(meta.attributedTo).toBeUndefined();
    });

    it("ignores non-PreCompact hookEvent attachments", () => {
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "PreToolUse:Read",
          hookEvent: "PreToolUse",
          command: "noop",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 1,
        },
      });

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      const meta = (out[0] as { metadata: { attributedTo?: unknown } }).metadata;
      expect(meta.attributedTo).toBeUndefined();
    });

    it("does not attribute a PreCompact attachment older than the TTL", () => {
      __setPreCompactBufferTtlForTest(0); // any non-zero age is stale
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "stale-hook.sh",
          hookEvent: "PreCompact",
          command: "stale-hook.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 12,
        },
      });

      // Force a measurable gap — the next push/compare will see ts < now
      const start = Date.now();
      while (Date.now() === start) {
        /* spin one millisecond */
      }

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      const meta = (out[0] as { metadata: { attributedTo?: unknown } }).metadata;
      expect(meta.attributedTo).toBeUndefined();
    });

    it("consumes the attribution so the next compact is not double-attributed", () => {
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "rotate-once.sh",
          hookEvent: "PreCompact",
          command: "rotate-once.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 5,
        },
      });

      const firstOut = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      expect((firstOut[0] as { metadata: { attributedTo?: { hookName: string } } })
        .metadata.attributedTo?.hookName).toBe("rotate-once.sh");

      const secondOut = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      const meta = (secondOut[0] as { metadata: { attributedTo?: unknown } }).metadata;
      expect(meta.attributedTo).toBeUndefined();
    });

    it("attributes compact_boundary to a PostCompact hook_success (R-2)", () => {
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "summarize-postcompact.sh",
          hookEvent: "PostCompact",
          command: "summarize-postcompact.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 8,
        },
      });

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: {
          trigger: "auto",
          preTokens: 200000,
          postTokens: 10000,
          durationMs: 42000,
        },
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        type: "compact",
        metadata: {
          trigger: "auto",
          attributedTo: { hookName: "summarize-postcompact.sh" },
        },
      });
      const attribution = (out[0] as {
        metadata: { attributedTo?: { cancelled?: boolean } };
      }).metadata.attributedTo;
      expect(attribution?.cancelled).toBeUndefined();
    });

    it("attributes compact_boundary to the most recent of mixed PreCompact + PostCompact (R-2)", () => {
      // PreCompact fires first
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "pre-rotate.sh",
          hookEvent: "PreCompact",
          command: "pre-rotate.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 5,
        },
      });
      // Then PostCompact fires within the window — should be the consumed one
      mapSdkMessageToSSEEvents({
        type: "attachment",
        attachment: {
          type: "hook_success",
          hookName: "post-summary.sh",
          hookEvent: "PostCompact",
          command: "post-summary.sh",
          stdout: "",
          stderr: "",
          exitCode: 0,
          content: "",
          durationMs: 7,
        },
      });

      const out = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens: 100, postTokens: 50 },
      });
      expect((out[0] as { metadata: { attributedTo?: { hookName: string } } })
        .metadata.attributedTo?.hookName).toBe("post-summary.sh");
    });
  });
});
