import { useCallback, useRef, useState } from "react";
import type { StreamingToolEntry, StreamingState } from "../lib/streaming-types";
import { createInitialStreamingState } from "../lib/streaming-types";

export interface StreamingStateActions {
  /** Process a parsed SSE event from the server */
  handleSSEEvent: (data: { type: string; [key: string]: unknown }) => void;
  /** Reset streaming state (e.g., when a new message starts) */
  reset: () => void;
}

export interface UseStreamingStateReturn {
  state: StreamingState;
  actions: StreamingStateActions;
}

export function useStreamingState(): UseStreamingStateReturn {
  const [state, setState] = useState<StreamingState>(createInitialStreamingState);
  const activeToolRef = useRef<string | null>(null);

  const handleSSEEvent = useCallback((data: { type: string; [key: string]: unknown }) => {
    setState((prev) => {
      switch (data.type) {
        case "thinking": {
          const text = data.text as string;
          return {
            ...prev,
            thinking: {
              text: prev.thinking.text + text,
              isComplete: false,
            },
          };
        }

        case "tool_start": {
          const id = data.id as string;
          const name = data.name as string;
          const input = data.input as Record<string, unknown> | undefined;
          const entry: StreamingToolEntry = {
            id,
            name,
            input,
            inputJson: "",
            status: "running",
            startedAt: Date.now(),
          };
          const newTools = new Map(prev.tools);
          newTools.set(id, entry);
          activeToolRef.current = id;
          return {
            ...prev,
            tools: newTools,
            toolOrder: [...prev.toolOrder, id],
            activeToolId: id,
          };
        }

        case "tool_delta": {
          const partialJson = data.partial_json as string;
          const toolId = activeToolRef.current;
          if (!toolId) return prev;
          const existing = prev.tools.get(toolId);
          if (!existing) return prev;

          const newJson = existing.inputJson + partialJson;
          // Try to parse the accumulated JSON for input preview
          let parsedInput = existing.input;
          try {
            parsedInput = JSON.parse(newJson);
          } catch {
            // Incomplete JSON, keep accumulating
          }

          const newTools = new Map(prev.tools);
          newTools.set(toolId, {
            ...existing,
            inputJson: newJson,
            input: parsedInput,
          });
          return { ...prev, tools: newTools };
        }

        case "tool_end": {
          // Mark the active tool's thinking as complete (input streaming done)
          // The tool is still "running" until tool_result arrives
          return {
            ...prev,
            thinking: {
              ...prev.thinking,
              isComplete: true,
            },
          };
        }

        case "tool_result": {
          const toolUseId = data.tool_use_id as string;
          const content = data.content;
          const isError = data.is_error as boolean | undefined;
          const existing = prev.tools.get(toolUseId);
          if (!existing) {
            // tool_result arrived before tool_start (race condition)
            // Create a placeholder entry
            const entry: StreamingToolEntry = {
              id: toolUseId,
              name: "unknown",
              inputJson: "",
              status: isError ? "error" : "success",
              resultContent: content,
              resultIsError: isError,
              startedAt: Date.now(),
              completedAt: Date.now(),
            };
            const newTools = new Map(prev.tools);
            newTools.set(toolUseId, entry);
            return {
              ...prev,
              tools: newTools,
              toolOrder: [...prev.toolOrder, toolUseId],
            };
          }
          const newTools = new Map(prev.tools);
          newTools.set(toolUseId, {
            ...existing,
            status: isError ? "error" : "success",
            resultContent: content,
            resultIsError: isError,
            completedAt: Date.now(),
          });
          return { ...prev, tools: newTools };
        }

        case "tool_progress": {
          // Update elapsed time for the tool (informational)
          return prev;
        }

        case "status": {
          const status = data.status as string | null;
          return {
            ...prev,
            status,
            isCompacting: status === "compacting",
          };
        }

        case "compact": {
          const metadata = data.metadata as { trigger?: string; pre_tokens?: number } | undefined;
          return {
            ...prev,
            isCompacting: false,
            compactResult: metadata
              ? { trigger: metadata.trigger ?? "unknown", preTokens: metadata.pre_tokens ?? 0 }
              : null,
          };
        }

        default:
          return prev;
      }
    });
  }, []);

  const reset = useCallback(() => {
    activeToolRef.current = null;
    setState(createInitialStreamingState());
  }, []);

  return {
    state,
    actions: { handleSSEEvent, reset },
  };
}
