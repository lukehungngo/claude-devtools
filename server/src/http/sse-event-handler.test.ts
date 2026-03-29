import { describe, it, expect } from "vitest";
import { mapSdkMessageToSSEEvents } from "./sse-event-handler.js";

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

    it("maps compact_boundary message", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 50000 },
      });
      expect(result).toEqual([
        {
          type: "compact",
          metadata: { trigger: "auto", pre_tokens: 50000 },
        },
      ]);
    });

    it("ignores other system subtypes", () => {
      const result = mapSdkMessageToSSEEvents({
        type: "system",
        subtype: "init",
        tools: [],
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
});
